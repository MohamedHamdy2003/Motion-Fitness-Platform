import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { RewriterService } from '../../infrastructure/ai/rewriter.service';
import { query } from '../../infrastructure/database/query';
import { ProgramAggregate } from './program.dto';

type Actor = { userId: string };

@Injectable()
export class ProgramService {
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Optional() @Inject(RewriterService) private rewriter?: RewriterService,
  ) {}

  private async lockActor(m: EntityManager, actor: Actor) {
    await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [
      actor.userId,
    ]);
  }

  async list(
    limit: number,
    offset: number,
    filters: {
      status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      search?: string;
    } = {},
  ) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.status === 'ARCHIVED') {
      conditions.push('p.archived');
    } else if (filters.status === 'DRAFT' || filters.status === 'PUBLISHED') {
      params.push(filters.status);
      conditions.push(`NOT p.archived AND pv.status = $${params.length}`);
    } else {
      conditions.push('NOT p.archived');
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(pv.title ILIKE $${params.length} OR p.slug ILIKE $${params.length})`,
      );
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const baseFrom = `FROM programs p JOIN LATERAL(SELECT * FROM program_versions WHERE program_id=p.id ORDER BY version DESC LIMIT 1) pv ON true ${whereClause}`;
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [rows, countRows] = await Promise.all([
      query(
        this.db,
        `SELECT p.id,p.slug,p.archived,pv.id AS version_id,pv.version,pv.revision,pv.status,pv.title,pv.primary_goal,(SELECT array_agg(primary_goal_code ORDER BY primary_goal_code) FROM program_version_supported_goals WHERE program_version_id=pv.id) AS supported_goals,pv.ideal_level,(SELECT array_agg(fitness_level_code ORDER BY fitness_level_code) FROM program_version_supported_levels WHERE program_version_id=pv.id) AS supported_levels,pv.training_days_per_week,pv.created_at,(SELECT count(*)::integer FROM monthly_plans mp WHERE mp.program_version_id=pv.id) AS month_count ${baseFrom} ORDER BY p.slug LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset],
      ),
      query(this.db, `SELECT count(*)::integer AS total ${baseFrom}`, params),
    ]);

    return {
      items: rows,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  async get(id: string) {
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.readProgram(manager, id),
    );
  }

  private async readProgram(manager: EntityManager, id: string) {
    const [program] = await query(
      manager,
      `SELECT p.*,pv.id AS version_id,pv.version,pv.revision,pv.status,pv.title,pv.primary_goal,(SELECT array_agg(primary_goal_code ORDER BY primary_goal_code) FROM program_version_supported_goals WHERE program_version_id=pv.id) AS supported_goals,pv.ideal_level,(SELECT array_agg(fitness_level_code ORDER BY fitness_level_code) FROM program_version_supported_levels WHERE program_version_id=pv.id) AS supported_levels,pv.training_days_per_week,pv.editorial_priority,pv.description,pv.required_equipment,pv.intended_audience,pv.nutrition_plan_version_id,pv.approved_hint_version_id,npv.duration_days FROM programs p JOIN LATERAL(SELECT * FROM program_versions WHERE program_id=p.id ORDER BY version DESC LIMIT 1) pv ON true JOIN nutrition_plan_versions npv ON npv.id=pv.nutrition_plan_version_id WHERE p.id=$1`,
      [id],
    );
    if (!program) throw new ApiError('NOT_FOUND', 404);
    program.hints = await query(
      manager,
      `SELECT * FROM program_hint_versions WHERE program_version_id=$1 ORDER BY version`,
      [program.version_id],
    );
    const schedule = await query(
      manager,
      `SELECT mp.id AS month_id,mp.position AS month_position,mp.title AS month_title,w.id AS week_id,w.position AS week_position,d.id AS day_id,d.position AS day_position,d.kind,d.workout_revision_id,d.nutrition_template_day_id,wr.title AS workout_title,wr.description AS workout_description FROM monthly_plans mp LEFT JOIN plan_weeks w ON w.monthly_plan_id=mp.id LEFT JOIN plan_days d ON d.week_id=w.id LEFT JOIN workout_revisions wr ON wr.id=d.workout_revision_id WHERE mp.program_version_id=$1 ORDER BY mp.position,w.position,d.position`,
      [program.version_id],
    );
    const exercises = await query(
      manager,
      `SELECT d.id AS day_id,we.id,we.exercise_revision_id,we.position,we.set_count,we.reps_min,we.reps_max,we.duration_seconds,we.rest_seconds,er.content FROM plan_days d JOIN plan_weeks w ON w.id=d.week_id JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN workout_exercises we ON we.workout_revision_id=d.workout_revision_id JOIN exercise_revisions er ON er.id=we.exercise_revision_id WHERE mp.program_version_id=$1 ORDER BY mp.position,w.position,d.position,we.position`,
      [program.version_id],
    );
    const meals = await query(
      manager,
      `SELECT nt.id AS day_id,ms.id,ms.position,ms.meal_type,ms.local_time,ms.default_meal_version_id,mv.meal_id,mv.version,mv.title,mv.status FROM nutrition_template_days nt JOIN meal_slots ms ON ms.template_day_id=nt.id JOIN meal_versions mv ON mv.id=ms.default_meal_version_id WHERE nt.nutrition_plan_version_id=$1 ORDER BY nt.day_position,ms.position`,
      [program.nutrition_plan_version_id],
    );
    const monthMap = new Map<string, Record<string, any>>();
    const weekMap = new Map<string, Record<string, any>>();
    const dayMap = new Map<string, Record<string, any>>();
    for (const row of schedule) {
      let month = monthMap.get(row.month_id);
      if (!month) {
        month = {
          id: row.month_id,
          position: row.month_position,
          title: row.month_title,
          weeks: [],
        };
        monthMap.set(row.month_id, month);
      }
      if (!row.week_id) continue;
      let week = weekMap.get(row.week_id);
      if (!week) {
        week = { id: row.week_id, position: row.week_position, days: [] };
        weekMap.set(row.week_id, week);
        month.weeks.push(week);
      }
      if (!row.day_id) continue;
      const day = {
        id: row.day_id,
        position: row.day_position,
        kind: row.kind,
        workout_revision_id: row.workout_revision_id,
        nutrition_template_day_id: row.nutrition_template_day_id,
        workout_title: row.workout_title,
        workout_description: row.workout_description,
        exercises: [],
        meals: [],
      };
      dayMap.set(row.day_id, day);
      week.days.push(day);
    }
    for (const row of exercises) dayMap.get(row.day_id)?.exercises.push(row);
    for (const row of meals) dayMap.get(row.day_id)?.meals.push(row);
    program.months = [...monthMap.values()];
    return program;
  }

  async create(actor: Actor, input: ProgramAggregate) {
    const id = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const programId = randomUUID();
      await query(m, `INSERT INTO programs(id,slug) VALUES($1,$2)`, [
        programId,
        input.slug,
      ]);
      await this.createVersion(m, programId, 1, input);
      return programId;
    });
    return this.get(id);
  }

  async update(
    actor: Actor,
    id: string,
    input: Omit<ProgramAggregate, 'slug'>,
  ) {
    const resourceId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const [program] = await query(
        m,
        `SELECT * FROM programs WHERE id=$1 AND NOT archived FOR UPDATE`,
        [id],
      );
      if (!program) throw new ApiError('NOT_FOUND', 404);
      const [current] = await query(
        m,
        `SELECT * FROM program_versions WHERE program_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!current) throw new ApiError('NOT_FOUND', 404);
      const [nutrition] = await query(
        m,
        `SELECT * FROM nutrition_plan_versions WHERE id=$1 FOR UPDATE`,
        [current.nutrition_plan_version_id],
      );
      if (current.status === 'PUBLISHED') {
        await this.createVersion(m, id, current.version + 1, input);
        return id;
      }
      if (current.status !== 'DRAFT' || nutrition.status !== 'DRAFT')
        throw new ApiError('PROGRAM_VERSION_IMMUTABLE', 409);
      await this.validateReferences(m, input, false);
      await this.clearSchedule(m, current.id, nutrition.id);
      await this.updateMetadata(m, current.id, input);
      await query(
        m,
        `UPDATE program_versions SET revision=revision+1 WHERE id=$1`,
        [current.id],
      );
      await query(
        m,
        `UPDATE nutrition_plan_versions SET duration_days=$2,revision=revision+1 WHERE id=$1`,
        [nutrition.id, input.months.length * 28],
      );
      await this.insertSchedule(m, current.id, nutrition.id, input);
      return id;
    });
    return this.get(resourceId);
  }

  async publish(actor: Actor, id: string) {
    const resourceId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const [program] = await query(
        m,
        `SELECT * FROM programs WHERE id=$1 AND NOT archived FOR UPDATE`,
        [id],
      );
      if (!program) throw new ApiError('NOT_FOUND', 404);
      const [version] = await query(
        m,
        `SELECT * FROM program_versions WHERE program_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.status !== 'DRAFT')
        throw new ApiError('ALREADY_PUBLISHED', 409);
      const [nutrition] = await query(
        m,
        `SELECT * FROM nutrition_plan_versions WHERE id=$1 FOR UPDATE`,
        [version.nutrition_plan_version_id],
      );
      if (!nutrition || nutrition.status !== 'DRAFT')
        throw new ApiError('PROGRAM_PAIR_INVALID', 409);
      await this.validatePublication(m, version, nutrition);
      await query(
        m,
        `UPDATE nutrition_plan_versions SET status='PUBLISHED',revision=revision+1 WHERE id=$1`,
        [nutrition.id],
      );
      await query(
        m,
        `UPDATE workout_revisions SET status='PUBLISHED',revision=revision+1 WHERE id IN (SELECT workout_revision_id FROM plan_days WHERE workout_revision_id IS NOT NULL AND week_id IN (SELECT w.id FROM plan_weeks w JOIN monthly_plans mp ON mp.id=w.monthly_plan_id WHERE mp.program_version_id=$1))`,
        [version.id],
      );
      await query(
        m,
        `UPDATE program_versions SET status='PUBLISHED',revision=revision+1 WHERE id=$1`,
        [version.id],
      );
      return id;
    });
    return this.get(resourceId);
  }

  async archive(actor: Actor, id: string) {
    await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const [program] = await query(
        m,
        `SELECT * FROM programs WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!program) throw new ApiError('NOT_FOUND', 404);
      const [version] = await query(
        m,
        `SELECT * FROM program_versions WHERE program_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (program.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      await query(m, `UPDATE programs SET archived=true WHERE id=$1`, [id]);
    });
    return this.get(id);
  }

  async addHint(
    actor: Actor,
    id: string,
    input: {
      originalText: string;
      structuredHints: Record<string, unknown>;
    },
  ) {
    const hintId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const [version] = await query(
        m,
        `SELECT pv.* FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.id=$1 AND NOT p.archived ORDER BY pv.version DESC LIMIT 1 FOR UPDATE OF pv`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.status !== 'DRAFT')
        throw new ApiError('PROGRAM_VERSION_IMMUTABLE', 409);
      const [last] = await query(
        m,
        `SELECT COALESCE(max(version),0)::integer AS version FROM program_hint_versions WHERE program_version_id=$1`,
        [version.id],
      );
      const createdId = randomUUID();
      const hint = (
        await query(
          m,
          `INSERT INTO program_hint_versions(id,program_version_id,version,original_text,structured_hints) VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [
            createdId,
            version.id,
            last.version + 1,
            input.originalText,
            input.structuredHints,
          ],
        )
      )[0];
      await query(
        m,
        `UPDATE program_versions SET approved_hint_version_id=NULL,revision=revision+1 WHERE id=$1`,
        [version.id],
      );
      return hint.id;
    });
    const [hint] = await query(
      this.db,
      `SELECT * FROM program_hint_versions WHERE id=$1`,
      [hintId],
    );
    return hint;
  }

  async rewriteHint(actor: Actor, id: string, originalText: string) {
    const [version] = await query(
      this.db,
      `SELECT pv.title,pv.description,pv.primary_goal AS "primaryGoal",
              pv.training_days_per_week AS "trainingDaysPerWeek",
              pv.required_equipment AS "requiredEquipment",
              pv.intended_audience AS "intendedAudience",
              ARRAY(SELECT fitness_level_code FROM program_version_supported_levels WHERE program_version_id=pv.id ORDER BY fitness_level_code) AS "supportedLevels"
       FROM program_versions pv JOIN programs p ON p.id=pv.program_id
       WHERE p.id=$1 AND NOT p.archived ORDER BY pv.version DESC LIMIT 1`,
      [id],
    );
    if (!version) throw new ApiError('NOT_FOUND', 404);
    const rewriter = this.rewriter ?? new RewriterService(this.db);
    return rewriter.previewProgramHints(actor.userId, {
      ...version,
      originalText,
    });
  }

  async approveHint(actor: Actor, id: string, hintId: string) {
    const approvedId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const [version] = await query(
        m,
        `SELECT pv.* FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.id=$1 AND NOT p.archived ORDER BY pv.version DESC LIMIT 1 FOR UPDATE OF pv`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.status !== 'DRAFT')
        throw new ApiError('PROGRAM_VERSION_IMMUTABLE', 409);
      const [hint] = await query(
        m,
        `UPDATE program_hint_versions SET status='APPROVED',approved_by=$3,approved_at=now() WHERE id=$1 AND program_version_id=$2 AND status='DRAFT' RETURNING *`,
        [hintId, version.id, actor.userId],
      );
      if (!hint) throw new ApiError('PROGRAM_HINT_NOT_FOUND', 404);
      await query(
        m,
        `UPDATE program_versions SET approved_hint_version_id=$2,revision=revision+1 WHERE id=$1`,
        [version.id, hintId],
      );
      return hint.id;
    });
    const [hint] = await query(
      this.db,
      `SELECT * FROM program_hint_versions WHERE id=$1`,
      [approvedId],
    );
    return hint;
  }

  private async createVersion(
    m: EntityManager,
    programId: string,
    version: number,
    input: Omit<ProgramAggregate, 'slug'>,
  ) {
    await this.validateReferences(m, input, false);
    const [program] = await query(m, `SELECT slug FROM programs WHERE id=$1`, [
      programId,
    ]);
    const nutritionPlanId = randomUUID();
    const nutritionVersionId = randomUUID();
    const versionId = randomUUID();
    await query(m, `INSERT INTO nutrition_plans(id,slug) VALUES($1,$2)`, [
      nutritionPlanId,
      `${program.slug}-nutrition-v${version}`,
    ]);
    await query(
      m,
      `INSERT INTO nutrition_plan_versions(id,nutrition_plan_id,version,duration_days) VALUES($1,$2,1,$3)`,
      [nutritionVersionId, nutritionPlanId, input.months.length * 28],
    );
    await query(
      m,
      `INSERT INTO program_versions(id,program_id,version,title,primary_goal,ideal_level,training_days_per_week,editorial_priority,description,required_equipment,intended_audience,nutrition_plan_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        versionId,
        programId,
        version,
        input.title,
        input.primaryGoal,
        input.idealLevel,
        input.trainingDaysPerWeek,
        input.editorialPriority,
        input.description,
        input.requiredEquipment,
        input.intendedAudience,
        nutritionVersionId,
      ],
    );
    if (input.supportedGoals.length) {
      await query(
        m,
        `INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code)
         SELECT $1, code FROM unnest($2::text[]) AS code`,
        [versionId, input.supportedGoals],
      );
    }
    if (input.supportedLevels.length) {
      await query(
        m,
        `INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code)
         SELECT $1, code FROM unnest($2::text[]) AS code`,
        [versionId, input.supportedLevels],
      );
    }
    await this.insertSchedule(m, versionId, nutritionVersionId, input);
    return versionId;
  }

  private async updateMetadata(
    m: EntityManager,
    id: string,
    input: Omit<ProgramAggregate, 'slug'>,
  ) {
    await query(
      m,
      `UPDATE program_versions SET title=$2,primary_goal=$3,ideal_level=$4,training_days_per_week=$5,editorial_priority=$6,description=$7,required_equipment=$8,intended_audience=$9,approved_hint_version_id=NULL WHERE id=$1`,
      [
        id,
        input.title,
        input.primaryGoal,
        input.idealLevel,
        input.trainingDaysPerWeek,
        input.editorialPriority,
        input.description,
        input.requiredEquipment,
        input.intendedAudience,
      ],
    );
    await query(
      m,
      `DELETE FROM program_version_supported_goals WHERE program_version_id=$1`,
      [id],
    );
    if (input.supportedGoals.length) {
      await query(
        m,
        `INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code)
         SELECT $1, code FROM unnest($2::text[]) AS code`,
        [id, input.supportedGoals],
      );
    }
    await query(
      m,
      `DELETE FROM program_version_supported_levels WHERE program_version_id=$1`,
      [id],
    );
    if (input.supportedLevels.length) {
      await query(
        m,
        `INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code)
         SELECT $1, code FROM unnest($2::text[]) AS code`,
        [id, input.supportedLevels],
      );
    }
  }

  private async clearSchedule(
    m: EntityManager,
    programVersionId: string,
    nutritionVersionId: string,
  ) {
    await query(
      m,
      `DELETE FROM plan_days WHERE week_id IN (SELECT w.id FROM plan_weeks w JOIN monthly_plans mp ON mp.id=w.monthly_plan_id WHERE mp.program_version_id=$1)`,
      [programVersionId],
    );
    await query(
      m,
      `DELETE FROM plan_weeks WHERE monthly_plan_id IN (SELECT id FROM monthly_plans WHERE program_version_id=$1)`,
      [programVersionId],
    );
    await query(m, `DELETE FROM monthly_plans WHERE program_version_id=$1`, [
      programVersionId,
    ]);
    await query(
      m,
      `DELETE FROM meal_slots WHERE template_day_id IN (SELECT id FROM nutrition_template_days WHERE nutrition_plan_version_id=$1)`,
      [nutritionVersionId],
    );
    await query(
      m,
      `DELETE FROM nutrition_template_days WHERE nutrition_plan_version_id=$1`,
      [nutritionVersionId],
    );
    await query(
      m,
      `DELETE FROM workout_exercises WHERE workout_revision_id IN (SELECT wr.id FROM workout_revisions wr JOIN workouts w ON w.id=wr.workout_id WHERE w.slug LIKE $1)`,
      [`program-${programVersionId}-%`],
    );
    await query(
      m,
      `DELETE FROM workout_revisions WHERE workout_id IN (SELECT id FROM workouts WHERE slug LIKE $1)`,
      [`program-${programVersionId}-%`],
    );
    await query(m, `DELETE FROM workouts WHERE slug LIKE $1`, [
      `program-${programVersionId}-%`,
    ]);
  }

  private async validateReferences(
    m: EntityManager,
    input: Omit<ProgramAggregate, 'slug'>,
    publication: boolean,
  ) {
    const goalCodes = new Set([input.primaryGoal, ...input.supportedGoals]);
    const goals = await query(
      m,
      `SELECT code FROM primary_goals WHERE active AND code=ANY($1::text[])`,
      [[...goalCodes]],
    );
    const availableGoals = new Set(
      goals.map((row: { code: string }) => row.code),
    );
    const unavailableGoals = [...goalCodes].filter(
      (code) => !availableGoals.has(code),
    );
    if (unavailableGoals.length)
      throw new ApiError(
        'PRIMARY_GOAL_NOT_FOUND',
        422,
        `Primary goal value(s) ${unavailableGoals.join(', ')} are unavailable or inactive. Fetch GET /references/primary-goals for currently available values.`,
        { primary_goal_codes: unavailableGoals },
      );
    const levels = await query(
      m,
      `SELECT code FROM fitness_levels WHERE active AND code=ANY($1::text[])`,
      [[...new Set([input.idealLevel, ...input.supportedLevels])]],
    );
    const requestedLevels = new Set([
      input.idealLevel,
      ...input.supportedLevels,
    ]);
    const availableLevels = new Set(
      levels.map((row: { code: string }) => row.code),
    );
    const unavailableLevels = [...requestedLevels].filter(
      (code) => !availableLevels.has(code),
    );
    if (unavailableLevels.length)
      throw new ApiError(
        'FITNESS_LEVEL_NOT_FOUND',
        422,
        `Fitness level value(s) ${unavailableLevels.join(', ')} are unavailable or inactive. Fetch GET /references/fitness-levels for currently available values.`,
        { fitness_level_codes: unavailableLevels },
      );
    const exerciseIds = new Set<string>();
    const mealIds = new Set<string>();
    for (const month of input.months) {
      for (const week of month.weeks) {
        const trainingDays = week.days.filter((d) => d.kind === 'TRAINING');
        if (trainingDays.length !== input.trainingDaysPerWeek)
          throw new ApiError('PROGRAM_WEEK_TRAINING_DAYS_INVALID', 422);
        for (const day of week.days) {
          if (day.kind === 'TRAINING') {
            for (const exercise of day.workout.exercises) {
              exerciseIds.add(exercise.exerciseRevisionId);
            }
          }
          for (const slot of day.meals) {
            mealIds.add(slot.mealVersionId);
          }
        }
      }
    }

    const uniqueExerciseIds = [...exerciseIds];
    if (uniqueExerciseIds.length) {
      const validExercises = await query(
        m,
        `SELECT er.id FROM exercise_revisions er
         JOIN exercises e ON e.id=er.exercise_id
         WHERE er.id = ANY($1::uuid[])
           AND NOT e.archived
           AND ($2::boolean=false OR er.status='PUBLISHED')
         FOR SHARE OF er, e`,
        [uniqueExerciseIds, publication],
      );
      const validSet = new Set(
        validExercises.map((row: { id: string }) => row.id),
      );
      const missingExercise = uniqueExerciseIds.find((id) => !validSet.has(id));
      if (missingExercise) {
        throw new ApiError(
          'PROGRAM_EXERCISE_UNAVAILABLE',
          422,
          `Exercise revision "${missingExercise}" is unavailable.`,
          { exercise_revision_id: missingExercise },
        );
      }
    }

    const uniqueMealIds = [...mealIds];
    if (uniqueMealIds.length) {
      const validMeals = await query(
        m,
        `SELECT mv.id FROM meal_versions mv
         JOIN meals m ON m.id=mv.meal_id
         JOIN meal_sections ms ON ms.id=mv.section_id
         WHERE mv.id = ANY($1::uuid[])
           AND NOT m.archived
           AND NOT ms.archived
           AND ($2::boolean=false OR (mv.status='PUBLISHED' AND mv.availability_status='AVAILABLE'))
         FOR SHARE OF mv, m, ms`,
        [uniqueMealIds, publication],
      );
      const validSet = new Set(validMeals.map((row: { id: string }) => row.id));
      const missingMeal = uniqueMealIds.find((id) => !validSet.has(id));
      if (missingMeal) {
        throw new ApiError(
          'PROGRAM_MEAL_UNAVAILABLE',
          422,
          `Meal version "${missingMeal}" is unavailable.`,
          { meal_version_id: missingMeal },
        );
      }
    }
  }

  private async insertSchedule(
    m: EntityManager,
    programVersionId: string,
    nutritionVersionId: string,
    input: Omit<ProgramAggregate, 'slug'>,
  ) {
    const monthIds: string[] = [];
    const monthPositions: number[] = [];
    const monthTitles: string[] = [];

    const weekIds: string[] = [];
    const weekMonthIds: string[] = [];
    const weekPositions: number[] = [];

    const nutritionDayIds: string[] = [];
    const nutritionDayPositions: number[] = [];

    const workoutIds: string[] = [];
    const workoutSlugs: string[] = [];

    const workoutRevIds: string[] = [];
    const workoutRevWorkoutIds: string[] = [];
    const workoutRevTitles: string[] = [];
    const workoutRevDescs: string[] = [];

    const weIds: string[] = [];
    const weWorkoutRevIds: string[] = [];
    const weExerciseRevIds: string[] = [];
    const wePositions: number[] = [];
    const weSetCounts: number[] = [];
    const weRepsMins: (number | null)[] = [];
    const weRepsMaxs: (number | null)[] = [];
    const weDurations: (number | null)[] = [];
    const weRests: number[] = [];

    const planDayIds: string[] = [];
    const planDayWeekIds: string[] = [];
    const planDayPositions: number[] = [];
    const planDayKinds: string[] = [];
    const planDayWorkoutRevIds: (string | null)[] = [];
    const planDayNutritionDayIds: string[] = [];

    const slotIds: string[] = [];
    const slotTemplateDayIds: string[] = [];
    const slotPositions: number[] = [];
    const slotMealTypes: string[] = [];
    const slotLocalTimes: string[] = [];
    const slotMealVersionIds: string[] = [];

    let ordinal = 0;
    for (let monthIndex = 0; monthIndex < input.months.length; monthIndex++) {
      const month = input.months[monthIndex];
      const monthId = randomUUID();
      monthIds.push(monthId);
      monthPositions.push(monthIndex + 1);
      monthTitles.push(month.title);

      for (let weekIndex = 0; weekIndex < 4; weekIndex++) {
        const weekId = randomUUID();
        weekIds.push(weekId);
        weekMonthIds.push(monthId);
        weekPositions.push(weekIndex + 1);

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const day = month.weeks[weekIndex].days[dayIndex];
          ordinal++;
          const nutritionDayId = randomUUID();
          nutritionDayIds.push(nutritionDayId);
          nutritionDayPositions.push(ordinal);

          let workoutRevisionId: string | null = null;
          if (day.kind === 'TRAINING') {
            const workoutId = randomUUID();
            workoutRevisionId = randomUUID();
            workoutIds.push(workoutId);
            workoutSlugs.push(`program-${programVersionId}-${ordinal}`);

            workoutRevIds.push(workoutRevisionId);
            workoutRevWorkoutIds.push(workoutId);
            workoutRevTitles.push(day.workout.title);
            workoutRevDescs.push(day.workout.description);

            for (
              let position = 0;
              position < day.workout.exercises.length;
              position++
            ) {
              const exercise = day.workout.exercises[position];
              const prescription = exercise.prescription;
              weIds.push(randomUUID());
              weWorkoutRevIds.push(workoutRevisionId);
              weExerciseRevIds.push(exercise.exerciseRevisionId);
              wePositions.push(position);
              weSetCounts.push(prescription.setCount);
              weRepsMins.push(
                prescription.mode === 'REPS' ? prescription.repsMin : null,
              );
              weRepsMaxs.push(
                prescription.mode === 'REPS' ? prescription.repsMax : null,
              );
              weDurations.push(
                prescription.mode === 'DURATION'
                  ? prescription.durationSeconds
                  : null,
              );
              weRests.push(prescription.restSeconds);
            }
          }

          planDayIds.push(randomUUID());
          planDayWeekIds.push(weekId);
          planDayPositions.push(dayIndex + 1);
          planDayKinds.push(day.kind);
          planDayWorkoutRevIds.push(workoutRevisionId);
          planDayNutritionDayIds.push(nutritionDayId);

          for (let position = 0; position < day.meals.length; position++) {
            const slot = day.meals[position];
            slotIds.push(randomUUID());
            slotTemplateDayIds.push(nutritionDayId);
            slotPositions.push(position);
            slotMealTypes.push(slot.mealType);
            slotLocalTimes.push(slot.localTime);
            slotMealVersionIds.push(slot.mealVersionId);
          }
        }
      }
    }

    if (monthIds.length) {
      await query(
        m,
        `INSERT INTO monthly_plans(id,program_version_id,position,title)
         SELECT id, $1, pos, title
         FROM unnest($2::uuid[], $3::integer[], $4::text[]) AS t(id, pos, title)`,
        [programVersionId, monthIds, monthPositions, monthTitles],
      );
    }
    if (weekIds.length) {
      await query(
        m,
        `INSERT INTO plan_weeks(id,monthly_plan_id,position)
         SELECT id, mp_id, pos
         FROM unnest($1::uuid[], $2::uuid[], $3::integer[]) AS t(id, mp_id, pos)`,
        [weekIds, weekMonthIds, weekPositions],
      );
    }
    if (nutritionDayIds.length) {
      await query(
        m,
        `INSERT INTO nutrition_template_days(id,nutrition_plan_version_id,day_position)
         SELECT id, $1, pos
         FROM unnest($2::uuid[], $3::integer[]) AS t(id, pos)`,
        [nutritionVersionId, nutritionDayIds, nutritionDayPositions],
      );
    }
    if (workoutIds.length) {
      await query(
        m,
        `INSERT INTO workouts(id,slug)
         SELECT id, slug
         FROM unnest($1::uuid[], $2::text[]) AS t(id, slug)`,
        [workoutIds, workoutSlugs],
      );
      await query(
        m,
        `INSERT INTO workout_revisions(id,workout_id,version,title,description)
         SELECT id, w_id, 1, title, descr
         FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[])
           AS t(id, w_id, title, descr)`,
        [
          workoutRevIds,
          workoutRevWorkoutIds,
          workoutRevTitles,
          workoutRevDescs,
        ],
      );
    }
    if (weIds.length) {
      await query(
        m,
        `INSERT INTO workout_exercises(id,workout_revision_id,exercise_revision_id,position,set_count,reps_min,reps_max,duration_seconds,rest_seconds)
         SELECT * FROM unnest(
           $1::uuid[], $2::uuid[], $3::uuid[], $4::integer[], $5::integer[],
           $6::integer[], $7::integer[], $8::integer[], $9::integer[]
         )`,
        [
          weIds,
          weWorkoutRevIds,
          weExerciseRevIds,
          wePositions,
          weSetCounts,
          weRepsMins,
          weRepsMaxs,
          weDurations,
          weRests,
        ],
      );
    }
    if (planDayIds.length) {
      await query(
        m,
        `INSERT INTO plan_days(id,week_id,position,kind,workout_revision_id,nutrition_template_day_id)
         SELECT * FROM unnest(
           $1::uuid[], $2::uuid[], $3::integer[], $4::text[], $5::uuid[], $6::uuid[]
         )`,
        [
          planDayIds,
          planDayWeekIds,
          planDayPositions,
          planDayKinds,
          planDayWorkoutRevIds,
          planDayNutritionDayIds,
        ],
      );
    }
    if (slotIds.length) {
      await query(
        m,
        `INSERT INTO meal_slots(id,template_day_id,position,meal_type,local_time,default_meal_version_id)
         SELECT id, td_id, pos, mt, lt::time, mv_id
         FROM unnest(
           $1::uuid[], $2::uuid[], $3::integer[], $4::text[], $5::text[], $6::uuid[]
         ) AS t(id, td_id, pos, mt, lt, mv_id)`,
        [
          slotIds,
          slotTemplateDayIds,
          slotPositions,
          slotMealTypes,
          slotLocalTimes,
          slotMealVersionIds,
        ],
      );
    }
  }

  private async validatePublication(
    m: EntityManager,
    version: Record<string, any>,
    nutrition: Record<string, any>,
  ) {
    const [shape] = await query(
      m,
      `SELECT count(DISTINCT mp.id)::integer AS months,count(DISTINCT w.id)::integer AS weeks,count(DISTINCT d.id)::integer AS days,count(DISTINCT nt.id)::integer AS nutrition_days,count(DISTINCT ms.id)::integer AS slots,count(DISTINCT d.id) FILTER(WHERE d.kind='TRAINING')::integer AS training_days FROM monthly_plans mp LEFT JOIN plan_weeks w ON w.monthly_plan_id=mp.id LEFT JOIN plan_days d ON d.week_id=w.id LEFT JOIN nutrition_template_days nt ON nt.id=d.nutrition_template_day_id LEFT JOIN meal_slots ms ON ms.template_day_id=nt.id WHERE mp.program_version_id=$1`,
      [version.id],
    );
    const expectedDays = shape.months * 28;
    const [nutritionDayCount] = await query(
      m,
      `SELECT count(*)::integer AS count FROM nutrition_template_days WHERE nutrition_plan_version_id=$1`,
      [nutrition.id],
    );
    if (
      shape.months < 1 ||
      shape.weeks !== shape.months * 4 ||
      shape.days !== expectedDays ||
      shape.nutrition_days !== expectedDays ||
      nutritionDayCount.count !== expectedDays ||
      nutrition.duration_days !== expectedDays ||
      shape.slots < expectedDays
    )
      throw new ApiError('PROGRAM_SCHEDULE_INCOMPLETE', 422);
    const [emptyDay] = await query(
      m,
      `SELECT nt.id FROM nutrition_template_days nt LEFT JOIN meal_slots ms ON ms.template_day_id=nt.id WHERE nt.nutrition_plan_version_id=$1 GROUP BY nt.id HAVING count(ms.id)=0 LIMIT 1`,
      [nutrition.id],
    );
    if (emptyDay) throw new ApiError('PROGRAM_SCHEDULE_INCOMPLETE', 422);
    const invalidWeek = await query(
      m,
      `SELECT w.id FROM plan_weeks w JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN plan_days d ON d.week_id=w.id WHERE mp.program_version_id=$1 GROUP BY w.id HAVING count(d.id)<>7 OR count(*) FILTER(WHERE d.kind='TRAINING')<>$2 LIMIT 1`,
      [version.id, version.training_days_per_week],
    );
    if (invalidWeek.length) throw new ApiError('PROGRAM_WEEK_INVALID', 422);
    const [workouts] = await query(
      m,
      `SELECT count(*)::integer AS total,count(*) FILTER(WHERE wr.status<>'DRAFT')::integer AS non_draft,count(*) FILTER(WHERE x.exercise_count=0)::integer AS empty FROM plan_days d JOIN plan_weeks w ON w.id=d.week_id JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN workout_revisions wr ON wr.id=d.workout_revision_id LEFT JOIN LATERAL(SELECT count(*)::integer AS exercise_count FROM workout_exercises we WHERE we.workout_revision_id=wr.id) x ON true WHERE mp.program_version_id=$1 AND d.kind='TRAINING'`,
      [version.id],
    );
    if (workouts.total === 0 || workouts.empty > 0 || workouts.non_draft > 0)
      throw new ApiError('PROGRAM_WORKOUTS_INCOMPLETE', 422);
    const [exerciseCheck] = await query(
      m,
      `SELECT count(*)::integer AS total,count(*) FILTER(WHERE er.status<>'PUBLISHED' OR e.archived OR length(trim(er.content->>'description'))=0)::integer AS invalid FROM plan_days d JOIN plan_weeks w ON w.id=d.week_id JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN workout_exercises we ON we.workout_revision_id=d.workout_revision_id JOIN exercise_revisions er ON er.id=we.exercise_revision_id JOIN exercises e ON e.id=er.exercise_id WHERE mp.program_version_id=$1`,
      [version.id],
    );
    if (exerciseCheck.total === 0 || exerciseCheck.invalid > 0)
      throw new ApiError('PROGRAM_EXERCISE_UNAVAILABLE', 422);
    const [badMeals] = await query(
      m,
      `SELECT count(*)::integer AS total FROM meal_slots ms JOIN nutrition_template_days nt ON nt.id=ms.template_day_id JOIN meal_versions mv ON mv.id=ms.default_meal_version_id JOIN meals m ON m.id=mv.meal_id JOIN meal_sections sec ON sec.id=mv.section_id WHERE nt.nutrition_plan_version_id=$1 AND (mv.status<>'PUBLISHED' OR mv.availability_status<>'AVAILABLE' OR m.archived OR sec.archived OR NOT EXISTS(SELECT 1 FROM meal_items mi WHERE mi.meal_version_id=mv.id) OR EXISTS(SELECT 1 FROM meal_items mi JOIN food_exchange_members fem ON fem.id=mi.default_exchange_member_id JOIN food_exchange_group_versions fgv ON fgv.id=fem.group_version_id JOIN food_exchange_groups fg ON fg.id=fgv.group_id JOIN food_versions fv ON fv.id=fem.food_version_id JOIN foods f ON f.id=fv.food_id WHERE mi.meal_version_id=mv.id AND (fg.archived OR fgv.status<>'PUBLISHED' OR fv.status<>'PUBLISHED' OR f.archived)))`,
      [nutrition.id],
    );
    if (badMeals.total > 0)
      throw new ApiError('PROGRAM_MEALS_UNPUBLISHED', 422);
    const [hints] = await query(
      m,
      `SELECT count(*)::integer AS total FROM program_hint_versions WHERE program_version_id=$1`,
      [version.id],
    );
    if (hints.total > 0) {
      const [approved] = await query(
        m,
        `SELECT h.id FROM program_hint_versions h WHERE h.id=$1 AND h.program_version_id=$2 AND h.status='APPROVED' AND h.version=(SELECT max(h2.version) FROM program_hint_versions h2 WHERE h2.program_version_id=$2)`,
        [version.approved_hint_version_id, version.id],
      );
      if (!approved) throw new ApiError('PROGRAM_HINT_APPROVAL_REQUIRED', 422);
    }
    const [mispaired] = await query(
      m,
      `SELECT count(*)::integer AS total FROM plan_days d JOIN plan_weeks w ON w.id=d.week_id JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN nutrition_template_days nt ON nt.id=d.nutrition_template_day_id WHERE mp.program_version_id=$1 AND (nt.nutrition_plan_version_id<>$2 OR nt.day_position<>((mp.position-1)*28+(w.position-1)*7+d.position))`,
      [version.id, nutrition.id],
    );
    if (mispaired.total > 0)
      throw new ApiError('PROGRAM_NUTRITION_PAIR_INVALID', 422);
  }
}
