import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';

type MemberInput = {
  foodVersionId: string;
  portionGPerUnit: number;
  displayPortion: string;
};
type MealItemInput = {
  memberId: string;
  exchangeUnits: number;
  position: number;
};

@Injectable()
export class NutritionLibraryService {
  constructor(@Inject(DataSource) private db: DataSource) {}

  listFoodSections(limit: number, offset: number) {
    return query(
      this.db,
      `SELECT g.*,v.id AS version_id,v.version,v.revision,v.title,v.status,(SELECT count(*)::integer FROM food_exchange_members m WHERE m.group_version_id=v.id) AS member_count FROM food_exchange_groups g JOIN LATERAL(SELECT * FROM food_exchange_group_versions WHERE group_id=g.id ORDER BY version DESC LIMIT 1) v ON true ORDER BY g.slug LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  async getFoodSection(id: string) {
    const [group] = await query(
      this.db,
      `SELECT * FROM food_exchange_groups WHERE id=$1`,
      [id],
    );
    if (!group) throw new ApiError('NOT_FOUND', 404);
    const versions = await query(
      this.db,
      `SELECT * FROM food_exchange_group_versions WHERE group_id=$1 ORDER BY version DESC`,
      [id],
    );
    for (const version of versions)
      version.members = await query(
        this.db,
        `SELECT m.*,f.food_id,f.version AS food_version,f.status AS food_status,f.content->>'title' AS food_title FROM food_exchange_members m JOIN food_versions f ON f.id=m.food_version_id WHERE m.group_version_id=$1 ORDER BY f.content->>'title'`,
        [version.id],
      );
    return { ...group, versions };
  }

  createFoodSection(slug: string, title: string, members: MemberInput[]) {
    return this.db.transaction(async (m) => {
      const id = randomUUID();
      const versionId = randomUUID();
      await query(
        m,
        `INSERT INTO food_exchange_groups(id,slug) VALUES($1,$2)`,
        [id, slug],
      );
      await query(
        m,
        `INSERT INTO food_exchange_group_versions(id,group_id,version,title) VALUES($1,$2,1,$3)`,
        [versionId, id, title],
      );
      await this.insertFoodMembers(m, versionId, members);
      return (
        await query(
          m,
          `SELECT g.*,v.id AS version_id,v.version,v.revision,v.title,v.status FROM food_exchange_groups g JOIN food_exchange_group_versions v ON v.group_id=g.id WHERE g.id=$1`,
          [id],
        )
      )[0];
    });
  }

  reviseFoodSection(
    id: string,
    expectedRevision: number,
    title: string,
    members: MemberInput[],
  ) {
    return this.db.transaction(async (m) => {
      const [group] = await query(
        m,
        `SELECT * FROM food_exchange_groups WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!group) throw new ApiError('NOT_FOUND', 404);
      if (group.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      const [current] = await query(
        m,
        `SELECT * FROM food_exchange_group_versions WHERE group_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (current.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (current.status === 'PUBLISHED') {
        const versionId = randomUUID();
        await query(
          m,
          `INSERT INTO food_exchange_group_versions(id,group_id,version,revision,title) VALUES($1,$2,$3,$4,$5)`,
          [versionId, id, current.version + 1, current.revision + 1, title],
        );
        await this.insertFoodMembers(m, versionId, members);
        return (
          await query(
            m,
            `SELECT * FROM food_exchange_group_versions WHERE id=$1`,
            [versionId],
          )
        )[0];
      }
      await query(
        m,
        `DELETE FROM food_exchange_members WHERE group_version_id=$1`,
        [current.id],
      );
      await this.insertFoodMembers(m, current.id, members);
      return (
        await query(
          m,
          `UPDATE food_exchange_group_versions SET title=$2,revision=revision+1 WHERE id=$1 RETURNING *`,
          [current.id, title],
        )
      )[0];
    });
  }

  async archiveFoodSection(id: string, expectedRevision: number) {
    return this.db.transaction(async (m) => {
      const [group] = await query(
        m,
        `SELECT * FROM food_exchange_groups WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!group) throw new ApiError('NOT_FOUND', 404);
      const [current] = await query(
        m,
        `SELECT revision FROM food_exchange_group_versions WHERE group_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (current.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (group.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      await query(
        m,
        `UPDATE food_exchange_groups SET archived=true WHERE id=$1`,
        [id],
      );
      return { id, archived: true };
    });
  }

  publishFoodSection(id: string, expectedRevision: number) {
    return this.db.transaction(async (m) => {
      const [group] = await query(
        m,
        `SELECT * FROM food_exchange_groups WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!group) throw new ApiError('NOT_FOUND', 404);
      if (group.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      const [version] = await query(
        m,
        `SELECT v.* FROM food_exchange_group_versions v WHERE v.group_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (version.status !== 'DRAFT')
        throw new ApiError('ALREADY_PUBLISHED', 409);
      const members = await query(
        m,
        `SELECT m.food_version_id,f.status,f.food_id,food.archived FROM food_exchange_members m JOIN food_versions f ON f.id=m.food_version_id JOIN foods food ON food.id=f.food_id WHERE m.group_version_id=$1 FOR SHARE OF f,food`,
        [version.id],
      );
      if (members.length < 2)
        throw new ApiError('FOOD_SECTION_NEEDS_ALTERNATIVES', 422);
      if (
        members.some(
          (member) => member.status !== 'PUBLISHED' || member.archived,
        )
      )
        throw new ApiError('FOOD_SECTION_FOOD_NOT_PUBLISHED', 422);
      return (
        await query(
          m,
          `UPDATE food_exchange_group_versions SET status='PUBLISHED',revision=revision+1 WHERE id=$1 RETURNING *`,
          [version.id],
        )
      )[0];
    });
  }

  async listMealSections(limit: number, offset: number) {
    return query(
      this.db,
      `SELECT s.*,(SELECT count(*)::integer FROM meal_versions v WHERE v.section_id=s.id AND v.status='PUBLISHED') AS published_meal_count FROM meal_sections s ORDER BY s.slug LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  async getMealSection(id: string) {
    const [section] = await query(
      this.db,
      `SELECT s.*,(SELECT count(*)::integer FROM meal_versions v WHERE v.section_id=s.id) AS meal_version_count FROM meal_sections s WHERE s.id=$1`,
      [id],
    );
    if (!section) throw new ApiError('NOT_FOUND', 404);
    return section;
  }

  async reviseMealSection(id: string, slug: string, title: string) {
    const [section] = await query(
      this.db,
      `UPDATE meal_sections SET slug=$2,title=$3 WHERE id=$1 AND NOT archived RETURNING *`,
      [id, slug, title],
    );
    if (!section) {
      await this.getMealSection(id);
      throw new ApiError('CONTENT_ARCHIVED', 409);
    }
    return section;
  }

  async archiveMealSection(id: string) {
    const [section] = await query(
      this.db,
      `UPDATE meal_sections SET archived=true WHERE id=$1 AND NOT archived RETURNING id`,
      [id],
    );
    if (!section) {
      await this.getMealSection(id);
      throw new ApiError('CONTENT_ARCHIVED', 409);
    }
    return { id, archived: true };
  }

  createMealSection(slug: string, title: string) {
    const id = randomUUID();
    return query(
      this.db,
      `INSERT INTO meal_sections(id,slug,title) VALUES($1,$2,$3) RETURNING *`,
      [id, slug, title],
    ).then((rows) => rows[0]);
  }

  listMeals(limit: number, offset: number) {
    return query(
      this.db,
      `SELECT m.*,v.id AS version_id,v.version,v.revision,v.section_id,v.title,v.status,v.availability_status FROM meals m JOIN LATERAL(SELECT * FROM meal_versions WHERE meal_id=m.id ORDER BY version DESC LIMIT 1) v ON true ORDER BY m.slug LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  async getMeal(id: string) {
    const [meal] = await query(this.db, `SELECT * FROM meals WHERE id=$1`, [
      id,
    ]);
    if (!meal) throw new ApiError('NOT_FOUND', 404);
    const versions = await query(
      this.db,
      `SELECT * FROM meal_versions WHERE meal_id=$1 ORDER BY version DESC`,
      [id],
    );
    for (const version of versions)
      version.items = await query(
        this.db,
        `SELECT i.*,m.group_version_id,m.food_version_id,m.portion_g_per_unit,m.display_portion,f.content->>'title' AS food_title,f.status AS food_status FROM meal_items i JOIN food_exchange_members m ON m.id=i.default_exchange_member_id JOIN food_versions f ON f.id=m.food_version_id WHERE i.meal_version_id=$1 ORDER BY i.position`,
        [version.id],
      );
    return { ...meal, versions };
  }

  async listCurrentMealItems(mealId: string) {
    const [version] = await query(
      this.db,
      `SELECT v.* FROM meals m JOIN LATERAL(SELECT * FROM meal_versions WHERE meal_id=m.id ORDER BY version DESC LIMIT 1) v ON true WHERE m.id=$1`,
      [mealId],
    );
    if (!version) throw new ApiError('NOT_FOUND', 404);
    return this.mealItemsForVersion(this.db, mealId, version);
  }

  async getCurrentMealItem(mealId: string, position: number) {
    const result = await this.listCurrentMealItems(mealId);
    const item = result.items.find(
      (row: { position: number }) => row.position === position,
    );
    if (!item) throw new ApiError('NOT_FOUND', 404);
    return {
      mealId: result.mealId,
      mealVersionId: result.mealVersionId,
      version: result.version,
      revision: result.revision,
      status: result.status,
      item,
    };
  }

  addMealItem(mealId: string, expectedRevision: number, item: MealItemInput) {
    return this.db.transaction(async (m) => {
      const version = await this.prepareMealItemEdit(
        m,
        mealId,
        expectedRevision,
      );
      await this.assertMealMemberExists(m, item.memberId);
      try {
        await query(
          m,
          `INSERT INTO meal_items(meal_version_id,default_exchange_member_id,exchange_units,position) VALUES($1,$2,$3,$4)`,
          [version.id, item.memberId, item.exchangeUnits, item.position],
        );
      } catch (error) {
        if (this.pgCode(error) === '23505')
          throw new ApiError('MEAL_ITEM_POSITION_EXISTS', 409);
        throw error;
      }
      if (!version.createdFromPublished)
        await query(
          m,
          `UPDATE meal_versions SET revision=revision+1 WHERE id=$1`,
          [version.id],
        );
      const [updated] = await query(
        m,
        `SELECT * FROM meal_versions WHERE id=$1`,
        [version.id],
      );
      return this.mealItemsForVersion(m, mealId, updated);
    });
  }

  updateMealItem(
    mealId: string,
    position: number,
    expectedRevision: number,
    input: {
      memberId?: string;
      exchangeUnits?: number;
      position?: number;
    },
  ) {
    return this.db.transaction(async (m) => {
      const version = await this.prepareMealItemEdit(
        m,
        mealId,
        expectedRevision,
      );
      const fields: [string, unknown][] = [];
      if (input.memberId !== undefined) {
        await this.assertMealMemberExists(m, input.memberId);
        fields.push(['default_exchange_member_id', input.memberId]);
      }
      if (input.exchangeUnits !== undefined)
        fields.push(['exchange_units', input.exchangeUnits]);
      if (input.position !== undefined)
        fields.push(['position', input.position]);
      try {
        const result = await query(
          m,
          `UPDATE meal_items SET ${fields.map(([name], index) => `${name}=$${index + 3}`).join(',')} WHERE meal_version_id=$1 AND position=$2 RETURNING position`,
          [version.id, position, ...fields.map(([, value]) => value)],
        );
        if (!result.length) throw new ApiError('NOT_FOUND', 404);
      } catch (error) {
        if (this.pgCode(error) === '23505')
          throw new ApiError('MEAL_ITEM_POSITION_EXISTS', 409);
        throw error;
      }
      if (!version.createdFromPublished)
        await query(
          m,
          `UPDATE meal_versions SET revision=revision+1 WHERE id=$1`,
          [version.id],
        );
      const [updated] = await query(
        m,
        `SELECT * FROM meal_versions WHERE id=$1`,
        [version.id],
      );
      return this.mealItemsForVersion(m, mealId, updated);
    });
  }

  deleteMealItem(mealId: string, position: number, expectedRevision: number) {
    return this.db.transaction(async (m) => {
      const version = await this.prepareMealItemEdit(
        m,
        mealId,
        expectedRevision,
      );
      const result = await query(
        m,
        `DELETE FROM meal_items WHERE meal_version_id=$1 AND position=$2 RETURNING position`,
        [version.id, position],
      );
      if (!result.length) throw new ApiError('NOT_FOUND', 404);
      if (!version.createdFromPublished)
        await query(
          m,
          `UPDATE meal_versions SET revision=revision+1 WHERE id=$1`,
          [version.id],
        );
      const [updated] = await query(
        m,
        `SELECT * FROM meal_versions WHERE id=$1`,
        [version.id],
      );
      return this.mealItemsForVersion(m, mealId, updated);
    });
  }

  private async prepareMealItemEdit(
    m: EntityManager,
    mealId: string,
    expectedRevision: number,
  ) {
    const [meal] = await query(
      m,
      `SELECT * FROM meals WHERE id=$1 FOR UPDATE`,
      [mealId],
    );
    if (!meal) throw new ApiError('NOT_FOUND', 404);
    if (meal.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
    const [current] = await query(
      m,
      `SELECT * FROM meal_versions WHERE meal_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [mealId],
    );
    if (!current) throw new ApiError('NOT_FOUND', 404);
    if (current.revision !== expectedRevision)
      throw new ApiError('REVISION_CONFLICT', 409);
    if (current.status !== 'PUBLISHED')
      return { ...current, createdFromPublished: false };

    const id = randomUUID();
    const [draft] = await query(
      m,
      `INSERT INTO meal_versions(id,meal_id,version,revision,section_id,title,availability_status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        id,
        mealId,
        current.version + 1,
        current.revision + 1,
        current.section_id,
        current.title,
        current.availability_status,
      ],
    );
    await query(
      m,
      `INSERT INTO meal_items(meal_version_id,default_exchange_member_id,exchange_units,position) SELECT $1,default_exchange_member_id,exchange_units,position FROM meal_items WHERE meal_version_id=$2`,
      [id, current.id],
    );
    return { ...draft, createdFromPublished: true };
  }

  private async assertMealMemberExists(m: EntityManager, memberId: string) {
    const [member] = await query(
      m,
      `SELECT id FROM food_exchange_members WHERE id=$1`,
      [memberId],
    );
    if (!member)
      throw new ApiError(
        'FOOD_SECTION_MEMBER_NOT_FOUND',
        422,
        `Food exchange member "${memberId}" is unavailable. Fetch GET /admin/food-sections to see available food members.`,
        { member_id: memberId },
      );
  }

  private async mealItemsForVersion(
    m: EntityManager | DataSource,
    mealId: string,
    version: {
      id: string;
      version: number;
      revision: number;
      status: string;
    },
  ) {
    const items = await query(
      m,
      `SELECT i.position,i.exchange_units,m.id AS member_id,m.group_version_id,m.food_version_id,m.portion_g_per_unit,m.display_portion,f.content->>'title' AS food_title,f.status AS food_status FROM meal_items i JOIN food_exchange_members m ON m.id=i.default_exchange_member_id JOIN food_versions f ON f.id=m.food_version_id WHERE i.meal_version_id=$1 ORDER BY i.position`,
      [version.id],
    );
    return {
      mealId,
      mealVersionId: version.id,
      version: version.version,
      revision: version.revision,
      status: version.status,
      items,
    };
  }

  private pgCode(error: unknown) {
    return typeof error === 'object' && error && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  }

  createMeal(
    slug: string,
    sectionId: string,
    title: string,
    items: MealItemInput[],
  ) {
    return this.db.transaction(async (m) => {
      const [section] = await query(
        m,
        `SELECT id FROM meal_sections WHERE id=$1 AND NOT archived FOR SHARE`,
        [sectionId],
      );
      if (!section)
        throw new ApiError(
          'MEAL_SECTION_UNAVAILABLE',
          422,
          `Meal section "${sectionId}" is unavailable or archived. Fetch GET /admin/meal-sections to see available sections.`,
          { section_id: sectionId },
        );
      const id = randomUUID();
      const versionId = randomUUID();
      await query(m, `INSERT INTO meals(id,slug) VALUES($1,$2)`, [id, slug]);
      await query(
        m,
        `INSERT INTO meal_versions(id,meal_id,version,section_id,title) VALUES($1,$2,1,$3,$4)`,
        [versionId, id, sectionId, title],
      );
      await this.insertMealItems(m, versionId, items);
      return (
        await query(
          m,
          `SELECT m.*,v.id AS version_id,v.version,v.revision,v.section_id,v.title,v.status FROM meals m JOIN meal_versions v ON v.meal_id=m.id WHERE m.id=$1`,
          [id],
        )
      )[0];
    });
  }

  reviseMeal(
    id: string,
    expectedRevision: number,
    sectionId: string,
    title: string,
    items: MealItemInput[],
  ) {
    return this.db.transaction(async (m) => {
      const [meal] = await query(
        m,
        `SELECT * FROM meals WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!meal) throw new ApiError('NOT_FOUND', 404);
      if (meal.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      const [section] = await query(
        m,
        `SELECT id FROM meal_sections WHERE id=$1 AND NOT archived FOR SHARE`,
        [sectionId],
      );
      if (!section)
        throw new ApiError(
          'MEAL_SECTION_UNAVAILABLE',
          422,
          `Meal section "${sectionId}" is unavailable or archived. Fetch GET /admin/meal-sections to see available sections.`,
          { section_id: sectionId },
        );
      const [current] = await query(
        m,
        `SELECT * FROM meal_versions WHERE meal_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (current.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (current.status === 'PUBLISHED') {
        const versionId = randomUUID();
        await query(
          m,
          `INSERT INTO meal_versions(id,meal_id,version,revision,section_id,title) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            versionId,
            id,
            current.version + 1,
            current.revision + 1,
            sectionId,
            title,
          ],
        );
        await this.insertMealItems(m, versionId, items);
        return (
          await query(m, `SELECT * FROM meal_versions WHERE id=$1`, [versionId])
        )[0];
      }
      await query(m, `DELETE FROM meal_items WHERE meal_version_id=$1`, [
        current.id,
      ]);
      await this.insertMealItems(m, current.id, items);
      return (
        await query(
          m,
          `UPDATE meal_versions SET section_id=$2,title=$3,revision=revision+1 WHERE id=$1 RETURNING *`,
          [current.id, sectionId, title],
        )
      )[0];
    });
  }

  async archiveMeal(id: string, expectedRevision: number) {
    return this.db.transaction(async (m) => {
      const [meal] = await query(
        m,
        `SELECT * FROM meals WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!meal) throw new ApiError('NOT_FOUND', 404);
      const [current] = await query(
        m,
        `SELECT revision FROM meal_versions WHERE meal_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (current.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (meal.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      await query(m, `UPDATE meals SET archived=true WHERE id=$1`, [id]);
      return { id, archived: true };
    });
  }

  publishMeal(id: string, expectedRevision: number) {
    return this.db.transaction(async (m) => {
      const [meal] = await query(
        m,
        `SELECT * FROM meals WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!meal) throw new ApiError('NOT_FOUND', 404);
      if (meal.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      const [version] = await query(
        m,
        `SELECT v.* FROM meal_versions v WHERE v.meal_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (version.status !== 'DRAFT')
        throw new ApiError('ALREADY_PUBLISHED', 409);
      const items = await query(
        m,
        `SELECT i.default_exchange_member_id,m.group_version_id,g.status AS section_status,f.status AS food_status,fg.archived AS food_section_archived,food.archived AS food_archived FROM meal_items i JOIN food_exchange_members m ON m.id=i.default_exchange_member_id JOIN food_exchange_group_versions g ON g.id=m.group_version_id JOIN food_exchange_groups fg ON fg.id=g.group_id JOIN food_versions f ON f.id=m.food_version_id JOIN foods food ON food.id=f.food_id WHERE i.meal_version_id=$1 FOR SHARE OF g,f,fg,food`,
        [version.id],
      );
      if (!items.length) throw new ApiError('MEAL_NEEDS_ITEMS', 422);
      if (
        items.some(
          (item) =>
            item.section_status !== 'PUBLISHED' ||
            item.food_status !== 'PUBLISHED' ||
            item.food_section_archived ||
            item.food_archived,
        )
      )
        throw new ApiError('MEAL_ITEM_NOT_PUBLISHED', 422);
      if (
        !(
          await query(
            m,
            `SELECT id FROM meal_sections WHERE id=$1 AND NOT archived`,
            [version.section_id],
          )
        ).length
      )
        throw new ApiError('MEAL_SECTION_UNAVAILABLE', 422);
      return (
        await query(
          m,
          `UPDATE meal_versions SET status='PUBLISHED',revision=revision+1 WHERE id=$1 RETURNING *`,
          [version.id],
        )
      )[0];
    });
  }

  private async insertFoodMembers(
    m: EntityManager,
    versionId: string,
    members: MemberInput[],
  ) {
    for (const member of members) {
      const [food] = await query(
        m,
        `SELECT id FROM food_versions WHERE id=$1`,
        [member.foodVersionId],
      );
      if (!food)
        throw new ApiError(
          'FOOD_VERSION_NOT_FOUND',
          422,
          `Food version "${member.foodVersionId}" is unavailable. Fetch GET /admin/foods to see available foods.`,
          { food_version_id: member.foodVersionId },
        );
      await query(
        m,
        `INSERT INTO food_exchange_members(id,group_version_id,food_version_id,portion_g_per_unit,display_portion) VALUES($1,$2,$3,$4,$5)`,
        [
          randomUUID(),
          versionId,
          member.foodVersionId,
          member.portionGPerUnit,
          member.displayPortion,
        ],
      );
    }
  }

  private async insertMealItems(
    m: EntityManager,
    versionId: string,
    items: MealItemInput[],
  ) {
    for (const item of items) {
      const [member] = await query(
        m,
        `SELECT id FROM food_exchange_members WHERE id=$1`,
        [item.memberId],
      );
      if (!member)
        throw new ApiError(
          'FOOD_SECTION_MEMBER_NOT_FOUND',
          422,
          `Food exchange member "${item.memberId}" is unavailable. Fetch GET /admin/food-sections to see available food members.`,
          { member_id: item.memberId },
        );
      await query(
        m,
        `INSERT INTO meal_items(meal_version_id,default_exchange_member_id,exchange_units,position) VALUES($1,$2,$3,$4)`,
        [versionId, item.memberId, item.exchangeUnits, item.position],
      );
    }
  }
}
