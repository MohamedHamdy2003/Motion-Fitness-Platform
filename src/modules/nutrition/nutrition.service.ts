import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';

export type NutrientTotals = {
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG: number;
  isPartial: boolean;
};

type RawFoodMetadata = {
  foodId: string;
  foodVersionId: string;
  foodTitle: string;
  preparation: string | null;
  preparationState: string | null;
  prepMinutes: number | null;
  energyKcal100g: number | null;
  proteinG100g: number | null;
  carbohydrateG100g: number | null;
  fatG100g: number | null;
  fiberG100g: number | null;
  ingredientIds: string[];
  allergenCodes: string[];
  hasUnverifiedIngredients: boolean;
};

type UserPreferenceSnapshot = {
  revision: number;
  allergens: Set<string>;
  dislikedIds: Set<string>;
};

@Injectable()
export class UserNutritionService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private withUser<T>(
    userId: string,
    operation: (manager: EntityManager) => Promise<T>,
  ) {
    return this.db.transaction(async (manager) => {
      const [user] = await query(
        manager,
        "SELECT id FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
        [userId],
      );
      if (!user) throw new ApiError('NOT_FOUND', 404);
      return operation(manager);
    });
  }

  private round(value: number) {
    return Number(value.toFixed(2));
  }

  private computeItemNutrients(
    food: RawFoodMetadata,
    portionG: number,
  ): {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
    fiberG: number | null;
    isPartial: boolean;
  } {
    const scale = (per100g: number | null) =>
      per100g === null || per100g === undefined
        ? null
        : this.round((Number(per100g) * portionG) / 100);
    const energyKcal = scale(food.energyKcal100g);
    const proteinG = scale(food.proteinG100g);
    const carbohydrateG = scale(food.carbohydrateG100g);
    const fatG = scale(food.fatG100g);
    const fiberG = scale(food.fiberG100g);
    return {
      energyKcal,
      proteinG,
      carbohydrateG,
      fatG,
      fiberG,
      isPartial:
        energyKcal === null ||
        proteinG === null ||
        carbohydrateG === null ||
        fatG === null,
    };
  }

  private sumNutrients(
    items: Array<{
      nutrients: {
        energyKcal: number | null;
        proteinG: number | null;
        carbohydrateG: number | null;
        fatG: number | null;
        fiberG: number | null;
        isPartial: boolean;
      };
    }>,
    extraPartial = false,
  ): NutrientTotals {
    let energyKcal = 0;
    let proteinG = 0;
    let carbohydrateG = 0;
    let fatG = 0;
    let fiberG = 0;
    let isPartial = extraPartial;
    for (const { nutrients } of items) {
      if (nutrients.isPartial) isPartial = true;
      energyKcal += nutrients.energyKcal ?? 0;
      proteinG += nutrients.proteinG ?? 0;
      carbohydrateG += nutrients.carbohydrateG ?? 0;
      fatG += nutrients.fatG ?? 0;
      fiberG += nutrients.fiberG ?? 0;
    }
    return {
      energyKcal: this.round(energyKcal),
      proteinG: this.round(proteinG),
      carbohydrateG: this.round(carbohydrateG),
      fatG: this.round(fatG),
      fiberG: this.round(fiberG),
      isPartial,
    };
  }

  private evaluateFlags(food: RawFoodMetadata, prefs: UserPreferenceSnapshot) {
    const matchedAllergens = food.allergenCodes.filter((code) =>
      prefs.allergens.has(code),
    );
    const isBlocked = matchedAllergens.length > 0;
    const isDisliked =
      prefs.dislikedIds.has(food.foodId) ||
      food.ingredientIds.some((id) => prefs.dislikedIds.has(id));
    const hasUnknownAllergenData =
      prefs.allergens.size > 0 && food.hasUnverifiedIngredients;
    return {
      isBlocked,
      isDisliked,
      hasUnknownAllergenData,
      matchedAllergens,
    };
  }

  private async loadPreferences(
    manager: EntityManager,
    userId: string,
  ): Promise<UserPreferenceSnapshot> {
    const [pref] = await query(
      manager,
      'SELECT revision FROM user_food_preferences WHERE user_id=$1',
      [userId],
    );
    const allergies = await query(
      manager,
      'SELECT allergen_code FROM user_allergies WHERE user_id=$1 ORDER BY allergen_code',
      [userId],
    );
    const dislikes = await query(
      manager,
      'SELECT food_id FROM user_disliked_foods WHERE user_id=$1',
      [userId],
    );
    return {
      revision: pref?.revision ?? 0,
      allergens: new Set(
        allergies.map((r: { allergen_code: string }) => r.allergen_code),
      ),
      dislikedIds: new Set(dislikes.map((r: { food_id: string }) => r.food_id)),
    };
  }

  private async loadFoodMetadataMap(
    manager: EntityManager,
    foodVersionIds: string[],
  ): Promise<Map<string, RawFoodMetadata>> {
    const unique = [...new Set(foodVersionIds)];
    if (!unique.length) return new Map();
    const rows = await query(
      manager,
      `SELECT fv.id AS "foodVersionId",
              fv.food_id AS "foodId",
              fv.content->>'title' AS "foodTitle",
              fv.content->>'preparation' AS preparation,
              fv.content->>'preparationState' AS "preparationState",
              (fv.content->>'prepMinutes')::numeric AS "prepMinutes",
              (fv.content->>'energyKcal100g')::numeric AS "energyKcal100g",
              (fv.content->>'proteinG100g')::numeric AS "proteinG100g",
              (fv.content->>'carbohydrateG100g')::numeric AS "carbohydrateG100g",
              (fv.content->>'fatG100g')::numeric AS "fatG100g",
              (fv.content->>'fiberG100g')::numeric AS "fiberG100g",
              COALESCE(ARRAY(
                SELECT fi.ingredient_id FROM food_ingredients fi
                WHERE fi.food_version_id=fv.id ORDER BY fi.ingredient_id
              ), '{}'::uuid[]) AS "ingredientIds",
              COALESCE(ARRAY(
                SELECT DISTINCT ia.allergen_code
                FROM food_ingredients fi
                JOIN ingredient_allergens ia ON ia.ingredient_id=fi.ingredient_id
                WHERE fi.food_version_id=fv.id ORDER BY ia.allergen_code
              ), '{}'::text[]) AS "allergenCodes",
              (
                NOT EXISTS(SELECT 1 FROM food_ingredients fi WHERE fi.food_version_id=fv.id)
                OR EXISTS(
                  SELECT 1 FROM food_ingredients fi
                  JOIN ingredients i ON i.id=fi.ingredient_id
                  WHERE fi.food_version_id=fv.id AND i.verification_status <> 'VERIFIED'
                )
              ) AS "hasUnverifiedIngredients"
       FROM food_versions fv
       WHERE fv.id = ANY($1::uuid[])`,
      [unique],
    );
    return new Map(
      rows.map((r: RawFoodMetadata) => [
        r.foodVersionId,
        {
          ...r,
          prepMinutes: r.prepMinutes === null ? null : Number(r.prepMinutes),
          energyKcal100g:
            r.energyKcal100g === null ? null : Number(r.energyKcal100g),
          proteinG100g: r.proteinG100g === null ? null : Number(r.proteinG100g),
          carbohydrateG100g:
            r.carbohydrateG100g === null ? null : Number(r.carbohydrateG100g),
          fatG100g: r.fatG100g === null ? null : Number(r.fatG100g),
          fiberG100g: r.fiberG100g === null ? null : Number(r.fiberG100g),
        },
      ]),
    );
  }

  async assignment(userId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [active] = await query(
        manager,
        `SELECT e.id AS "enrollmentId",
                e.program_version_id AS "programVersionId",
                pv.nutrition_plan_version_id AS "nutritionPlanVersionId",
                pv.title AS "programTitle",
                npv.duration_days AS "durationDays",
                e.starts_on::text AS "startsOn",
                (e.starts_on + npv.duration_days - 1)::text AS "endsOn",
                e.timezone,
                (now() AT TIME ZONE e.timezone)::date::text AS "localToday",
                ((now() AT TIME ZONE e.timezone)::date - e.starts_on + 1)::integer AS "currentDayNumber"
         FROM program_enrollments e
         JOIN program_versions pv ON pv.id=e.program_version_id
         JOIN nutrition_plan_versions npv ON npv.id=pv.nutrition_plan_version_id
         WHERE e.user_id=$1 AND e.ended_at IS NULL`,
        [userId],
      );
      if (active) return { status: 'ASSIGNED', ...active };

      const [run] = await query(
        manager,
        `SELECT id,status,failure_code FROM recommendation_runs
         WHERE user_id=$1 AND kind='USER' ORDER BY created_at DESC,id DESC LIMIT 1`,
        [userId],
      );
      const status =
        run?.status === 'PENDING' || run?.status === 'PROCESSING'
          ? 'PREPARING'
          : run?.status === 'NO_MATCH' || run?.status === 'FAILED'
            ? run.status
            : 'NOT_ASSIGNED';
      return {
        status,
        enrollmentId: null,
        nutritionPlanVersionId: null,
        recommendationRunId: run?.id ?? null,
        failureCode: run?.failure_code ?? null,
      };
    });
  }

  async ensureNutritionDay(
    manager: EntityManager,
    userId: string,
    date: string,
  ) {
    const [enrollment] = await query(
      manager,
      `SELECT e.id AS "enrollmentId",
              e.program_version_id AS "programVersionId",
              pv.nutrition_plan_version_id AS "nutritionPlanVersionId",
              npv.duration_days AS "durationDays",
              e.starts_on::text AS "startsOn",
              ($2::date - e.starts_on + 1)::integer AS "dayNumber"
       FROM program_enrollments e
       JOIN program_versions pv ON pv.id=e.program_version_id
       JOIN nutrition_plan_versions npv ON npv.id=pv.nutrition_plan_version_id
       WHERE e.user_id=$1 AND e.ended_at IS NULL`,
      [userId, date],
    );
    if (!enrollment || enrollment.dayNumber < 1) {
      throw new ApiError('NOT_FOUND', 404);
    }
    if (enrollment.dayNumber > enrollment.durationDays) {
      throw new ApiError(
        'NUTRITION_PLAN_COMPLETED',
        409,
        'The requested date is beyond the assigned program nutrition schedule.',
      );
    }

    const [existing] = await query(
      manager,
      `SELECT id FROM nutrition_days WHERE enrollment_id=$1 AND local_date=$2::date`,
      [enrollment.enrollmentId, date],
    );
    if (existing) {
      return { ...enrollment, nutritionDayId: existing.id as string };
    }

    const [templateDay] = await query(
      manager,
      `SELECT id FROM nutrition_template_days
       WHERE nutrition_plan_version_id=$1 AND day_position=$2`,
      [enrollment.nutritionPlanVersionId, enrollment.dayNumber],
    );
    if (!templateDay) throw new ApiError('NOT_FOUND', 404);

    const dayId = randomUUID();
    const [inserted] = await query(
      manager,
      `INSERT INTO nutrition_days(id,enrollment_id,template_day_id,day_number,local_date)
       VALUES($1,$2,$3,$4,$5::date)
       ON CONFLICT (enrollment_id,local_date) DO NOTHING
       RETURNING id`,
      [
        dayId,
        enrollment.enrollmentId,
        templateDay.id,
        enrollment.dayNumber,
        date,
      ],
    );
    if (!inserted) {
      const [concurrent] = await query(
        manager,
        `SELECT id FROM nutrition_days WHERE enrollment_id=$1 AND local_date=$2::date`,
        [enrollment.enrollmentId, date],
      );
      return { ...enrollment, nutritionDayId: concurrent.id as string };
    }

    const slots = await query(
      manager,
      `SELECT id,position,meal_type,local_time::text AS local_time,default_meal_version_id
       FROM meal_slots WHERE template_day_id=$1 ORDER BY position`,
      [templateDay.id],
    );
    for (const slot of slots) {
      const scheduledMealId = randomUUID();
      await query(
        manager,
        `INSERT INTO scheduled_meals(
           id,nutrition_day_id,meal_slot_id,position,meal_type,local_time,
           original_meal_version_id,selected_meal_version_id,selection_version,version,status
         ) VALUES($1,$2,$3,$4,$5,$6::time,$7,$7,1,1,'PENDING')`,
        [
          scheduledMealId,
          dayId,
          slot.id,
          slot.position,
          slot.meal_type,
          slot.local_time,
          slot.default_meal_version_id,
        ],
      );
      const mealItems = await query(
        manager,
        `SELECT mi.position,mi.default_exchange_member_id,mi.exchange_units,
                (mi.exchange_units * fem.portion_g_per_unit) AS portion_g
         FROM meal_items mi
         JOIN food_exchange_members fem ON fem.id=mi.default_exchange_member_id
         WHERE mi.meal_version_id=$1 ORDER BY mi.position`,
        [slot.default_meal_version_id],
      );
      for (const item of mealItems) {
        await query(
          manager,
          `INSERT INTO scheduled_meal_items(
             id,scheduled_meal_id,selection_version,position,
             original_exchange_member_id,selected_exchange_member_id,
             exchange_units,portion_g,version,status
           ) VALUES($1,$2,1,$3,$4,$4,$5,$6,1,'PENDING')`,
          [
            randomUUID(),
            scheduledMealId,
            item.position,
            item.default_exchange_member_id,
            item.exchange_units,
            this.round(Number(item.portion_g)),
          ],
        );
      }
    }
    return { ...enrollment, nutritionDayId: dayId };
  }

  async day(userId: string, date: string) {
    return this.withUser(userId, async (manager) => {
      const info = await this.ensureNutritionDay(manager, userId, date);
      return this.readDay(manager, userId, info.nutritionDayId, info);
    });
  }

  private async readDay(
    manager: EntityManager,
    userId: string,
    nutritionDayId: string,
    info: {
      enrollmentId: string;
      nutritionPlanVersionId: string;
      dayNumber: number;
    },
  ) {
    const [dayRow] = await query(
      manager,
      `SELECT id,local_date::text AS date,day_number AS "dayNumber",template_day_id AS "templateDayId"
       FROM nutrition_days WHERE id=$1`,
      [nutritionDayId],
    );
    const mealRows = await query(
      manager,
      `SELECT sm.id,sm.meal_slot_id AS "mealSlotId",sm.position,sm.meal_type AS "mealType",
              sm.local_time::text AS "localTime",sm.original_meal_version_id AS "originalMealVersionId",
              sm.selected_meal_version_id AS "selectedMealVersionId",sm.selection_version AS "selectionVersion",
              sm.version,sm.status,sm.completed_at AS "completedAt",
              mv.title,mv.section_id AS "sectionId",mv.meal_id AS "mealId"
       FROM scheduled_meals sm
       JOIN meal_versions mv ON mv.id=sm.selected_meal_version_id
       WHERE sm.nutrition_day_id=$1
       ORDER BY sm.position`,
      [nutritionDayId],
    );
    const meals = [];
    for (const meal of mealRows) {
      meals.push(await this.hydrateScheduledMeal(manager, userId, meal));
    }
    const plannedItems = meals.flatMap((m) => m._plannedItems);
    const selectedItems = meals.flatMap((m) => m.items);
    const consumedItems = selectedItems.filter(
      (item) => item.status === 'COMPLETED',
    );
    return {
      id: dayRow.id,
      date: dayRow.date,
      dayNumber: dayRow.dayNumber,
      enrollmentId: info.enrollmentId,
      nutritionPlanVersionId: info.nutritionPlanVersionId,
      totals: {
        planned: this.sumNutrients(plannedItems),
        selected: this.sumNutrients(selectedItems),
        consumed: this.sumNutrients(
          consumedItems,
          consumedItems.length < selectedItems.length,
        ),
      },
      meals: meals.map(({ _plannedItems, ...publicMeal }) => {
        void _plannedItems;
        return publicMeal;
      }),
    };
  }

  private async hydrateScheduledMeal(
    manager: EntityManager,
    userId: string,
    mealRow: Record<string, any>,
  ) {
    const prefs = await this.loadPreferences(manager, userId);
    const activeItems = await query(
      manager,
      `SELECT smi.id,smi.position,smi.selection_version AS "selectionVersion",
              smi.original_exchange_member_id AS "originalMemberId",
              smi.selected_exchange_member_id AS "selectedMemberId",
              smi.exchange_units AS "exchangeUnits",
              smi.portion_g AS "portionG",
              smi.version,smi.status,smi.completed_at AS "completedAt",
              fem.group_version_id AS "groupVersionId",
              fem.food_version_id AS "foodVersionId",
              fem.portion_g_per_unit AS "portionGPerUnit",
              fem.display_portion AS "displayPortion"
       FROM scheduled_meal_items smi
       JOIN food_exchange_members fem ON fem.id=smi.selected_exchange_member_id
       WHERE smi.scheduled_meal_id=$1 AND smi.selection_version=$2
       ORDER BY smi.position`,
      [mealRow.id, mealRow.selectionVersion],
    );
    const originalTemplateItems = await query(
      manager,
      `SELECT mi.position,mi.exchange_units AS "exchangeUnits",
              fem.food_version_id AS "foodVersionId",
              fem.portion_g_per_unit AS "portionGPerUnit"
       FROM meal_items mi
       JOIN food_exchange_members fem ON fem.id=mi.default_exchange_member_id
       WHERE mi.meal_version_id=$1
       ORDER BY mi.position`,
      [mealRow.originalMealVersionId],
    );

    const foodMap = await this.loadFoodMetadataMap(manager, [
      ...activeItems.map((i: { foodVersionId: string }) => i.foodVersionId),
      ...originalTemplateItems.map(
        (i: { foodVersionId: string }) => i.foodVersionId,
      ),
    ]);

    const items = activeItems.map((row: Record<string, any>) => {
      const food = foodMap.get(row.foodVersionId)!;
      const portionG = this.round(Number(row.portionG));
      const nutrients = this.computeItemNutrients(food, portionG);
      const flags = this.evaluateFlags(food, prefs);
      return {
        id: row.id,
        position: row.position,
        status: row.status,
        completedAt: row.completedAt,
        version: row.version,
        originalMemberId: row.originalMemberId,
        selectedMemberId: row.selectedMemberId,
        groupVersionId: row.groupVersionId,
        foodId: food.foodId,
        foodVersionId: row.foodVersionId,
        foodTitle: food.foodTitle,
        preparation: food.preparation,
        preparationState: food.preparationState,
        prepMinutes: food.prepMinutes,
        exchangeUnits: Number(row.exchangeUnits),
        portionGPerUnit: Number(row.portionGPerUnit),
        portionG,
        displayPortion: row.displayPortion,
        nutrients,
        ...flags,
      };
    });

    const plannedItems = originalTemplateItems.map(
      (row: Record<string, any>) => {
        const food = foodMap.get(row.foodVersionId)!;
        const portionG = this.round(
          Number(row.exchangeUnits) * Number(row.portionGPerUnit),
        );
        return {
          nutrients: this.computeItemNutrients(food, portionG),
        };
      },
    );

    const consumedItems = items.filter((item) => item.status === 'COMPLETED');
    return {
      id: mealRow.id,
      mealSlotId: mealRow.mealSlotId,
      position: mealRow.position,
      mealType: mealRow.mealType,
      localTime: mealRow.localTime.slice(0, 5),
      status: mealRow.status,
      completedAt: mealRow.completedAt,
      originalMealVersionId: mealRow.originalMealVersionId,
      selectedMealVersionId: mealRow.selectedMealVersionId,
      mealId: mealRow.mealId,
      sectionId: mealRow.sectionId,
      title: mealRow.title,
      selectionVersion: mealRow.selectionVersion,
      version: mealRow.version,
      totals: {
        planned: this.sumNutrients(plannedItems),
        selected: this.sumNutrients(items),
        consumed: this.sumNutrients(
          consumedItems,
          consumedItems.length < items.length,
        ),
      },
      items,
      _plannedItems: plannedItems,
    };
  }

  private async ownedMeal(
    manager: EntityManager,
    userId: string,
    mealId: string,
  ) {
    const [meal] = await query(
      manager,
      `SELECT sm.id,sm.meal_slot_id AS "mealSlotId",sm.position,sm.meal_type AS "mealType",
              sm.local_time::text AS "localTime",sm.original_meal_version_id AS "originalMealVersionId",
              sm.selected_meal_version_id AS "selectedMealVersionId",sm.selection_version AS "selectionVersion",
              sm.version,sm.status,sm.completed_at AS "completedAt",
              mv.title,mv.section_id AS "sectionId",mv.meal_id AS "mealId",
              orig_mv.section_id AS "originalSectionId",
              (e.ended_at IS NULL) AS "enrollmentActive"
       FROM scheduled_meals sm
       JOIN nutrition_days nd ON nd.id=sm.nutrition_day_id
       JOIN program_enrollments e ON e.id=nd.enrollment_id
       JOIN meal_versions mv ON mv.id=sm.selected_meal_version_id
       JOIN meal_versions orig_mv ON orig_mv.id=sm.original_meal_version_id
       WHERE sm.id=$1 AND e.user_id=$2
       FOR UPDATE OF sm`,
      [mealId, userId],
    );
    if (!meal) throw new ApiError('NOT_FOUND', 404);
    return meal;
  }

  private async ownedMealItem(
    manager: EntityManager,
    userId: string,
    itemId: string,
  ) {
    const [item] = await query(
      manager,
      `SELECT smi.id,smi.scheduled_meal_id AS "scheduledMealId",
              smi.selection_version AS "itemSelectionVersion",
              smi.position,
              smi.original_exchange_member_id AS "originalMemberId",
              smi.selected_exchange_member_id AS "selectedMemberId",
              smi.exchange_units AS "exchangeUnits",
              smi.portion_g AS "portionG",
              smi.version,smi.status,
              sm.selection_version AS "mealSelectionVersion",
              orig_fem.group_version_id AS "originalGroupVersionId",
              (e.ended_at IS NULL) AS "enrollmentActive"
       FROM scheduled_meal_items smi
       JOIN scheduled_meals sm ON sm.id=smi.scheduled_meal_id
       JOIN nutrition_days nd ON nd.id=sm.nutrition_day_id
       JOIN program_enrollments e ON e.id=nd.enrollment_id
       JOIN food_exchange_members orig_fem ON orig_fem.id=smi.original_exchange_member_id
       WHERE smi.id=$1 AND e.user_id=$2
       FOR UPDATE OF sm,smi`,
      [itemId, userId],
    );
    if (!item) throw new ApiError('NOT_FOUND', 404);
    if (item.itemSelectionVersion !== item.mealSelectionVersion) {
      throw new ApiError(
        'MEAL_ITEM_SUPERSEDED',
        409,
        'This meal item belongs to a replaced meal selection.',
      );
    }
    return item;
  }

  async getMeal(userId: string, mealId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const meal = await this.ownedMeal(manager, userId, mealId);
      const hydrated = await this.hydrateScheduledMeal(manager, userId, meal);
      const { _plannedItems, ...publicMeal } = hydrated;
      void _plannedItems;
      return publicMeal;
    });
  }

  async setMealCompletion(userId: string, mealId: string, completed: boolean) {
    return this.withUser(userId, async (manager) => {
      const meal = await this.ownedMeal(manager, userId, mealId);
      if (!meal.enrollmentActive) {
        throw new ApiError('ENROLLMENT_INACTIVE', 409);
      }
      await query(
        manager,
        `UPDATE scheduled_meal_items
         SET status=$3,
             completed_at=CASE WHEN $3='COMPLETED' THEN COALESCE(completed_at,now()) ELSE NULL END,
             version=version+1
         WHERE scheduled_meal_id=$1 AND selection_version=$2`,
        [meal.id, meal.selectionVersion, completed ? 'COMPLETED' : 'PENDING'],
      );
      await query(
        manager,
        `UPDATE scheduled_meals
         SET status=$2,
             completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at,now()) ELSE NULL END,
             version=version+1
         WHERE id=$1`,
        [meal.id, completed ? 'COMPLETED' : 'PENDING'],
      );
      const updated = await this.ownedMeal(manager, userId, meal.id);
      const { _plannedItems, ...publicMeal } = await this.hydrateScheduledMeal(
        manager,
        userId,
        updated,
      );
      void _plannedItems;
      return publicMeal;
    });
  }

  async setMealItemCompletion(
    userId: string,
    itemId: string,
    completed: boolean,
  ) {
    return this.withUser(userId, async (manager) => {
      const item = await this.ownedMealItem(manager, userId, itemId);
      if (!item.enrollmentActive) {
        throw new ApiError('ENROLLMENT_INACTIVE', 409);
      }
      await query(
        manager,
        `UPDATE scheduled_meal_items
         SET status=$2,
             completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at,now()) ELSE NULL END,
             version=version+1
         WHERE id=$1`,
        [item.id, completed ? 'COMPLETED' : 'PENDING'],
      );
      const [counts] = await query(
        manager,
        `SELECT count(*)::integer AS total,
                count(*) FILTER (WHERE status='COMPLETED')::integer AS completed
         FROM scheduled_meal_items
         WHERE scheduled_meal_id=$1 AND selection_version=$2`,
        [item.scheduledMealId, item.mealSelectionVersion],
      );
      const mealStatus =
        counts.completed === counts.total
          ? 'COMPLETED'
          : counts.completed > 0
            ? 'PARTIAL'
            : 'PENDING';
      await query(
        manager,
        `UPDATE scheduled_meals
         SET status=$2,
             completed_at=CASE WHEN $2='COMPLETED' THEN COALESCE(completed_at,now()) ELSE NULL END,
             version=version+1
         WHERE id=$1`,
        [item.scheduledMealId, mealStatus],
      );
      const updatedMeal = await this.ownedMeal(
        manager,
        userId,
        item.scheduledMealId,
      );
      const { _plannedItems, ...publicMeal } = await this.hydrateScheduledMeal(
        manager,
        userId,
        updatedMeal,
      );
      void _plannedItems;
      return publicMeal;
    });
  }

  async listMealItemAlternatives(userId: string, itemId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const item = await this.ownedMealItem(manager, userId, itemId);
      const candidates = await this.eligibleGroupAlternatives(
        manager,
        userId,
        item.originalGroupVersionId,
        item.selectedMemberId,
        Number(item.exchangeUnits),
      );
      return {
        status: candidates.length ? 'AVAILABLE' : 'NO_ALTERNATIVE',
        itemId: item.id,
        groupVersionId: item.originalGroupVersionId,
        items: candidates,
      };
    });
  }

  private async eligibleGroupAlternatives(
    manager: EntityManager,
    userId: string,
    groupVersionId: string,
    currentMemberId: string,
    exchangeUnits: number,
  ) {
    const prefs = await this.loadPreferences(manager, userId);
    const members = await query(
      manager,
      `SELECT fem.id AS "memberId",
              fem.group_version_id AS "groupVersionId",
              fem.food_version_id AS "foodVersionId",
              fem.portion_g_per_unit AS "portionGPerUnit",
              fem.display_portion AS "displayPortion"
       FROM food_exchange_members fem
       JOIN food_exchange_group_versions fgv ON fgv.id=fem.group_version_id
       JOIN food_exchange_groups fg ON fg.id=fgv.group_id
       JOIN food_versions fv ON fv.id=fem.food_version_id
       JOIN foods f ON f.id=fv.food_id
       WHERE fem.group_version_id=$1
         AND fem.id <> $2
         AND fgv.status='PUBLISHED'
         AND NOT fg.archived
         AND fv.status='PUBLISHED'
         AND NOT f.archived
       ORDER BY fv.content->>'title', fem.id`,
      [groupVersionId, currentMemberId],
    );
    const foodMap = await this.loadFoodMetadataMap(
      manager,
      members.map((m: { foodVersionId: string }) => m.foodVersionId),
    );
    const eligible = [];
    for (const member of members) {
      const food = foodMap.get(member.foodVersionId);
      if (!food) continue;
      const flags = this.evaluateFlags(food, prefs);
      if (flags.isBlocked || flags.isDisliked || flags.hasUnknownAllergenData) {
        continue;
      }
      const portionG = this.round(
        Number(member.portionGPerUnit) * exchangeUnits,
      );
      eligible.push({
        memberId: member.memberId,
        groupVersionId: member.groupVersionId,
        foodId: food.foodId,
        foodVersionId: member.foodVersionId,
        foodTitle: food.foodTitle,
        preparation: food.preparation,
        preparationState: food.preparationState,
        prepMinutes: food.prepMinutes,
        exchangeUnits,
        portionGPerUnit: Number(member.portionGPerUnit),
        portionG,
        displayPortion: member.displayPortion,
        nutrients: this.computeItemNutrients(food, portionG),
      });
    }
    return eligible;
  }

  async substituteMealItem(
    userId: string,
    itemId: string,
    selectedMemberId: string,
  ) {
    return this.withUser(userId, async (manager) => {
      const item = await this.ownedMealItem(manager, userId, itemId);
      if (!item.enrollmentActive) {
        throw new ApiError('ENROLLMENT_INACTIVE', 409);
      }
      if (item.status === 'COMPLETED') {
        throw new ApiError(
          'MEAL_ITEM_ALREADY_COMPLETED',
          409,
          'Completed meal items cannot be replaced.',
        );
      }
      const prefs = await this.loadPreferences(manager, userId);
      const candidates = await this.eligibleGroupAlternatives(
        manager,
        userId,
        item.originalGroupVersionId,
        item.selectedMemberId,
        Number(item.exchangeUnits),
      );
      const chosen = candidates.find((c) => c.memberId === selectedMemberId);
      if (!chosen) {
        throw new ApiError(
          'MEAL_ALTERNATIVE_UNAVAILABLE',
          422,
          'The selected food alternative is unavailable or conflicts with your current preferences.',
        );
      }
      const nextVersion = item.version + 1;
      await query(
        manager,
        `UPDATE scheduled_meal_items
         SET selected_exchange_member_id=$2,
             portion_g=$3,
             version=$4
         WHERE id=$1`,
        [item.id, chosen.memberId, chosen.portionG, nextVersion],
      );
      await query(
        manager,
        `UPDATE scheduled_meals SET version=version+1 WHERE id=$1`,
        [item.scheduledMealId],
      );
      await query(
        manager,
        `INSERT INTO meal_item_substitutions(
           id,scheduled_meal_item_id,from_member_id,to_member_id,
           resulting_item_version,portion_g,preference_revision
         ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          item.id,
          item.selectedMemberId,
          chosen.memberId,
          nextVersion,
          chosen.portionG,
          prefs.revision,
        ],
      );
      const updatedMeal = await this.ownedMeal(
        manager,
        userId,
        item.scheduledMealId,
      );
      const { _plannedItems, ...publicMeal } = await this.hydrateScheduledMeal(
        manager,
        userId,
        updatedMeal,
      );
      void _plannedItems;
      return publicMeal;
    });
  }

  async listMealAlternatives(userId: string, mealId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const meal = await this.ownedMeal(manager, userId, mealId);
      const candidates = await this.eligibleMealAlternatives(
        manager,
        userId,
        meal.originalSectionId,
        meal.mealId,
        meal.selectedMealVersionId,
      );
      return {
        status: candidates.length ? 'AVAILABLE' : 'NO_ALTERNATIVE',
        mealId: meal.id,
        sectionId: meal.originalSectionId,
        items: candidates,
      };
    });
  }

  private async eligibleMealAlternatives(
    manager: EntityManager,
    userId: string,
    sectionId: string,
    currentMealId: string,
    currentMealVersionId: string,
  ) {
    const prefs = await this.loadPreferences(manager, userId);
    const candidateMeals = await query(
      manager,
      `SELECT m.id AS "mealId",
              mv.id AS "mealVersionId",
              mv.version,
              mv.title,
              mv.section_id AS "sectionId"
       FROM meals m
       JOIN LATERAL (
         SELECT * FROM meal_versions
         WHERE meal_id=m.id AND status='PUBLISHED' AND availability_status='AVAILABLE'
         ORDER BY version DESC LIMIT 1
       ) mv ON true
       JOIN meal_sections ms ON ms.id=mv.section_id
       WHERE mv.section_id=$1
         AND NOT m.archived
         AND NOT ms.archived
         AND m.id <> $2
         AND mv.id <> $3
       ORDER BY mv.title, m.id`,
      [sectionId, currentMealId, currentMealVersionId],
    );
    const results = [];
    for (const candidate of candidateMeals) {
      const rawItems = await query(
        manager,
        `SELECT mi.position,
                mi.default_exchange_member_id AS "memberId",
                mi.exchange_units AS "exchangeUnits",
                fem.group_version_id AS "groupVersionId",
                fem.food_version_id AS "foodVersionId",
                fem.portion_g_per_unit AS "portionGPerUnit",
                fem.display_portion AS "displayPortion",
                fgv.status AS "groupStatus",
                fg.archived AS "groupArchived",
                fv.status AS "foodStatus",
                f.archived AS "foodArchived"
         FROM meal_items mi
         JOIN food_exchange_members fem ON fem.id=mi.default_exchange_member_id
         JOIN food_exchange_group_versions fgv ON fgv.id=fem.group_version_id
         JOIN food_exchange_groups fg ON fg.id=fgv.group_id
         JOIN food_versions fv ON fv.id=fem.food_version_id
         JOIN foods f ON f.id=fv.food_id
         WHERE mi.meal_version_id=$1
         ORDER BY mi.position`,
        [candidate.mealVersionId],
      );
      if (
        !rawItems.length ||
        rawItems.some(
          (i: Record<string, any>) =>
            i.groupStatus !== 'PUBLISHED' ||
            i.groupArchived ||
            i.foodStatus !== 'PUBLISHED' ||
            i.foodArchived,
        )
      ) {
        continue;
      }
      const foodMap = await this.loadFoodMetadataMap(
        manager,
        rawItems.map((i: { foodVersionId: string }) => i.foodVersionId),
      );
      let hasConflict = false;
      const hydratedItems = [];
      for (const row of rawItems) {
        const food = foodMap.get(row.foodVersionId);
        if (!food) {
          hasConflict = true;
          break;
        }
        const flags = this.evaluateFlags(food, prefs);
        if (
          flags.isBlocked ||
          flags.isDisliked ||
          flags.hasUnknownAllergenData
        ) {
          hasConflict = true;
          break;
        }
        const portionG = this.round(
          Number(row.portionGPerUnit) * Number(row.exchangeUnits),
        );
        hydratedItems.push({
          position: row.position,
          memberId: row.memberId,
          foodId: food.foodId,
          foodVersionId: row.foodVersionId,
          foodTitle: food.foodTitle,
          exchangeUnits: Number(row.exchangeUnits),
          portionG,
          displayPortion: row.displayPortion,
          nutrients: this.computeItemNutrients(food, portionG),
        });
      }
      if (hasConflict) continue;
      results.push({
        mealId: candidate.mealId,
        mealVersionId: candidate.mealVersionId,
        sectionId: candidate.sectionId,
        title: candidate.title,
        totals: this.sumNutrients(hydratedItems),
        items: hydratedItems,
      });
    }
    return results;
  }

  async substituteMeal(
    userId: string,
    mealId: string,
    selectedMealVersionId: string,
  ) {
    return this.withUser(userId, async (manager) => {
      const meal = await this.ownedMeal(manager, userId, mealId);
      if (!meal.enrollmentActive) {
        throw new ApiError('ENROLLMENT_INACTIVE', 409);
      }
      const [started] = await query(
        manager,
        `SELECT id FROM scheduled_meal_items
         WHERE scheduled_meal_id=$1 AND selection_version=$2 AND status='COMPLETED'
         LIMIT 1`,
        [meal.id, meal.selectionVersion],
      );
      if (started) {
        throw new ApiError(
          'MEAL_ALREADY_STARTED',
          409,
          'Whole-meal replacement is only available before any item in the meal has been consumed.',
        );
      }
      const prefs = await this.loadPreferences(manager, userId);
      const candidates = await this.eligibleMealAlternatives(
        manager,
        userId,
        meal.originalSectionId,
        meal.mealId,
        meal.selectedMealVersionId,
      );
      const chosen = candidates.find(
        (c) => c.mealVersionId === selectedMealVersionId,
      );
      if (!chosen) {
        throw new ApiError(
          'MEAL_ALTERNATIVE_UNAVAILABLE',
          422,
          'The selected meal alternative is unavailable or conflicts with your current preferences.',
        );
      }
      const nextSelectionVersion = meal.selectionVersion + 1;
      await query(
        manager,
        `UPDATE scheduled_meals
         SET selected_meal_version_id=$2,
             selection_version=$3,
             version=version+1,
             status='PENDING',
             completed_at=NULL
         WHERE id=$1`,
        [meal.id, chosen.mealVersionId, nextSelectionVersion],
      );
      for (const item of chosen.items) {
        await query(
          manager,
          `INSERT INTO scheduled_meal_items(
             id,scheduled_meal_id,selection_version,position,
             original_exchange_member_id,selected_exchange_member_id,
             exchange_units,portion_g,version,status
           ) VALUES($1,$2,$3,$4,$5,$5,$6,$7,1,'PENDING')`,
          [
            randomUUID(),
            meal.id,
            nextSelectionVersion,
            item.position,
            item.memberId,
            item.exchangeUnits,
            item.portionG,
          ],
        );
      }
      await query(
        manager,
        `INSERT INTO meal_substitutions(
           id,scheduled_meal_id,from_meal_version_id,to_meal_version_id,
           previous_selection_version,resulting_selection_version,preference_revision
         ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          meal.id,
          meal.selectedMealVersionId,
          chosen.mealVersionId,
          meal.selectionVersion,
          nextSelectionVersion,
          prefs.revision,
        ],
      );
      const updated = await this.ownedMeal(manager, userId, meal.id);
      const { _plannedItems, ...publicMeal } = await this.hydrateScheduledMeal(
        manager,
        userId,
        updated,
      );
      void _plannedItems;
      return publicMeal;
    });
  }
}
