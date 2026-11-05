import { createHmac, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { environment } from '../../config/environment';
import { query } from '../../infrastructure/database/query';
import { ProgramAggregate } from './program.dto';

type Actor = { userId: string };

@Injectable()
export class ProgramService {
  constructor(@Inject(DataSource) private db: DataSource) {}

  private async lockActor(m: EntityManager, actor: Actor) {
    await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [
      actor.userId,
    ]);
  }

  private digest(body: unknown) {
    return createHmac('sha256', environment().JWT_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
  }

  private async key(
    m: EntityManager,
    actor: Actor,
    scope: string,
    key: string,
    body: unknown,
  ) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 400);
    const [row] = await query(
      m,
      `SELECT resource_id,body_hash FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key=$3 FOR UPDATE`,
      [actor.userId, scope, key],
    );
    const hash = this.digest(body);
    if (row && row.body_hash !== hash)
      throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
    return row as { resource_id: string; body_hash: string } | undefined;
  }

  private async saveKey(
    m: EntityManager,
    actor: Actor,
    scope: string,
    key: string,
    body: unknown,
    resourceId: string,
  ) {
    await query(
      m,
      `INSERT INTO idempotency_keys(user_id,scope,key,body_hash,resource_id) VALUES($1,$2,$3,$4,$5)`,
      [actor.userId, scope, key, this.digest(body), resourceId],
    );
  }

  async list(limit: number, offset: number, status?: string) {
    return query(
      this.db,
      `SELECT p.id,p.slug,p.archived,pv.id AS version_id,pv.version,pv.revision,pv.status,pv.title,pv.primary_goal,(SELECT array_agg(primary_goal_code ORDER BY primary_goal_code) FROM program_version_supported_goals WHERE program_version_id=pv.id) AS supported_goals,pv.ideal_level,(SELECT array_agg(fitness_level_code ORDER BY fitness_level_code) FROM program_version_supported_levels WHERE program_version_id=pv.id) AS supported_levels,pv.training_days_per_week,pv.created_at,(SELECT count(*)::integer FROM monthly_plans mp WHERE mp.program_version_id=pv.id) AS month_count FROM programs p JOIN LATERAL(SELECT * FROM program_versions WHERE program_id=p.id ORDER BY version DESC LIMIT 1) pv ON true WHERE NOT p.archived AND ($3::text IS NULL OR pv.status=$3) ORDER BY p.slug LIMIT $1 OFFSET $2`,
      [limit, offset, status ?? null],
    );
  }

  async get(id: string) {
    const [program] = await query(
      this.db,
      `SELECT p.*,pv.id AS version_id,pv.version,pv.revision,pv.status,pv.title,pv.primary_goal,(SELECT array_agg(primary_goal_code ORDER BY primary_goal_code) FROM program_version_supported_goals WHERE program_version_id=pv.id) AS supported_goals,pv.ideal_level,(SELECT array_agg(fitness_level_code ORDER BY fitness_level_code) FROM program_version_supported_levels WHERE program_version_id=pv.id) AS supported_levels,pv.training_days_per_week,pv.editorial_priority,pv.description,pv.required_equipment,pv.intended_audience,pv.nutrition_plan_version_id,pv.approved_hint_version_id,npv.duration_days FROM programs p JOIN LATERAL(SELECT * FROM program_versions WHERE program_id=p.id ORDER BY version DESC LIMIT 1) pv ON true JOIN nutrition_plan_versions npv ON npv.id=pv.nutrition_plan_version_id WHERE p.id=$1`,
      [id],
    );
    if (!program) throw new ApiError('NOT_FOUND', 404);
    program.hints = await query(
      this.db,
      `SELECT * FROM program_hint_versions WHERE program_version_id=$1 ORDER BY version`,
      [program.version_id],
    );
    const [schedule, exercises, meals] = await Promise.all([
      query(
        this.db,
        `SELECT mp.id AS month_id,mp.position AS month_position,mp.title AS month_title,w.id AS week_id,w.position AS week_position,d.id AS day_id,d.position AS day_position,d.kind,d.workout_revision_id,d.nutrition_template_day_id,wr.title AS workout_title,wr.description AS workout_description FROM monthly_plans mp LEFT JOIN plan_weeks w ON w.monthly_plan_id=mp.id LEFT JOIN plan_days d ON d.week_id=w.id LEFT JOIN workout_revisions wr ON wr.id=d.workout_revision_id WHERE mp.program_version_id=$1 ORDER BY mp.position,w.position,d.position`,
        [program.version_id],
      ),
      query(
        this.db,
        `SELECT d.id AS day_id,we.id,we.exercise_revision_id,we.position,we.set_count,we.reps_min,we.reps_max,we.duration_seconds,we.rest_seconds,er.content FROM plan_days d JOIN plan_weeks w ON w.id=d.week_id JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN workout_exercises we ON we.workout_revision_id=d.workout_revision_id JOIN exercise_revisions er ON er.id=we.exercise_revision_id WHERE mp.program_version_id=$1 ORDER BY mp.position,w.position,d.position,we.position`,
        [program.version_id],
      ),
      query(
        this.db,
        `SELECT nt.id AS day_id,ms.id,ms.position,ms.meal_type,ms.local_time,ms.default_meal_version_id,mv.meal_id,mv.version,mv.title,mv.status FROM nutrition_template_days nt JOIN meal_slots ms ON ms.template_day_id=nt.id JOIN meal_versions mv ON mv.id=ms.default_meal_version_id WHERE nt.nutrition_plan_version_id=$1 ORDER BY nt.day_position,ms.position`,
        [program.nutrition_plan_version_id],
      ),
    ]);
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

  async create(actor: Actor, idempotencyKey: string, input: ProgramAggregate) {
    const scope = 'program-create';
    const id = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const repeated = await this.key(m, actor, scope, idempotencyKey, input);
      if (repeated?.resource_id) return repeated.resource_id;
      const programId = randomUUID();
      await query(m, `INSERT INTO programs(id,slug) VALUES($1,$2)`, [
        programId,
        input.slug,
      ]);
      await this.createVersion(m, programId, 1, input);
      await this.saveKey(m, actor, scope, idempotencyKey, input, programId);
      return programId;
    });
    return this.get(id);
  }

  async update(
    actor: Actor,
    id: string,
    idempotencyKey: string,
    input: Omit<ProgramAggregate, 'slug'> & { expectedVersion: number },
  ) {
    const scope = `program-edit:${id}`;
    const resourceId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const repeated = await this.key(m, actor, scope, idempotencyKey, input);
      if (repeated?.resource_id) return repeated.resource_id;
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
      if (current.revision !== input.expectedVersion)
        throw new ApiError('REVISION_CONFLICT', 409);
      const [nutrition] = await query(
        m,
        `SELECT * FROM nutrition_plan_versions WHERE id=$1 FOR UPDATE`,
        [current.nutrition_plan_version_id],
      );
      if (current.status === 'PUBLISHED') {
        await this.createVersion(m, id, current.version + 1, input);
        await this.saveKey(m, actor, scope, idempotencyKey, input, id);
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
      await this.saveKey(m, actor, scope, idempotencyKey, input, id);
      return id;
    });
    return this.get(resourceId);
  }

  async publish(
    actor: Actor,
    id: string,
    idempotencyKey: string,
    expectedVersion: number,
  ) {
    const scope = `program-publish:${id}`;
    const command = { expectedVersion };
    const resourceId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const repeated = await this.key(m, actor, scope, idempotencyKey, command);
      if (repeated?.resource_id) return repeated.resource_id;
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
      if (version.revision !== expectedVersion)
        throw new ApiError('REVISION_CONFLICT', 409);
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
      await this.saveKey(m, actor, scope, idempotencyKey, command, id);
      return id;
    });
    return this.get(resourceId);
  }

  async archive(
    actor: Actor,
    id: string,
    idempotencyKey: string,
    expectedVersion: number,
  ) {
    const scope = `program-archive:${id}`;
    const command = { expectedVersion };
    await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const repeated = await this.key(m, actor, scope, idempotencyKey, command);
      if (repeated) return;
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
      if (version.revision !== expectedVersion)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (program.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      await query(m, `UPDATE programs SET archived=true WHERE id=$1`, [id]);
      await this.saveKey(m, actor, scope, idempotencyKey, command, id);
    });
    return this.get(id);
  }

  async addHint(
    actor: Actor,
    id: string,
    idempotencyKey: string,
    input: {
      expectedVersion: number;
      originalText: string;
      structuredHints: Record<string, unknown>;
    },
  ) {
    const scope = `program-hint:${id}`;
    const hintId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const repeated = await this.key(m, actor, scope, idempotencyKey, input);
      if (repeated?.resource_id) return repeated.resource_id;
      const [version] = await query(
        m,
        `SELECT pv.* FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.id=$1 AND NOT p.archived ORDER BY pv.version DESC LIMIT 1 FOR UPDATE OF pv`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.status !== 'DRAFT')
        throw new ApiError('PROGRAM_VERSION_IMMUTABLE', 409);
      if (version.revision !== input.expectedVersion)
        throw new ApiError('REVISION_CONFLICT', 409);
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
      await this.saveKey(m, actor, scope, idempotencyKey, input, createdId);
      return hint.id;
    });
    const [hint] = await query(
      this.db,
      `SELECT * FROM program_hint_versions WHERE id=$1`,
      [hintId],
    );
    return hint;
  }

  async approveHint(
    actor: Actor,
    id: string,
    hintId: string,
    idempotencyKey: string,
    expectedVersion: number,
  ) {
    const scope = `program-hint-approve:${id}:${hintId}`;
    const command = { expectedVersion };
    const approvedId = await this.db.transaction(async (m) => {
      await this.lockActor(m, actor);
      const repeated = await this.key(m, actor, scope, idempotencyKey, command);
      if (repeated?.resource_id) return repeated.resource_id;
      const [version] = await query(
        m,
        `SELECT pv.* FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.id=$1 AND NOT p.archived ORDER BY pv.version DESC LIMIT 1 FOR UPDATE OF pv`,
        [id],
      );
      if (!version) throw new ApiError('NOT_FOUND', 404);
      if (version.status !== 'DRAFT')
        throw new ApiError('PROGRAM_VERSION_IMMUTABLE', 409);
      if (version.revision !== expectedVersion)
        throw new ApiError('REVISION_CONFLICT', 409);
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
      await this.saveKey(m, actor, scope, idempotencyKey, command, hintId);
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
    for (const goal of input.supportedGoals)
      await query(
        m,
        `INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code) VALUES($1,$2)`,
        [versionId, goal],
      );
    for (const level of input.supportedLevels)
      await query(
        m,
        `INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code) VALUES($1,$2)`,
        [versionId, level],
      );
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
    for (const goal of input.supportedGoals)
      await query(
        m,
        `INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code) VALUES($1,$2)`,
        [id, goal],
      );
    await query(
      m,
      `DELETE FROM program_version_supported_levels WHERE program_version_id=$1`,
      [id],
    );
    for (const level of input.supportedLevels)
      await query(
        m,
        `INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code) VALUES($1,$2)`,
        [id, level],
      );
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
      `SELECT code FROM primary_goals WHERE code=ANY($1::text[])`,
      [[...goalCodes]],
    );
    if (goals.length !== goalCodes.size)
      throw new ApiError('PRIMARY_GOAL_NOT_FOUND', 422);
    const levels = await query(
      m,
      `SELECT code FROM fitness_levels WHERE code=ANY($1::text[])`,
      [[...new Set([input.idealLevel, ...input.supportedLevels])]],
    );
    if (
      levels.length !==
      new Set([input.idealLevel, ...input.supportedLevels]).size
    )
      throw new ApiError('FITNESS_LEVEL_NOT_FOUND', 422);
    for (const month of input.months)
      for (const week of month.weeks) {
        const trainingDays = week.days.filter((d) => d.kind === 'TRAINING');
        if (trainingDays.length !== input.trainingDaysPerWeek)
          throw new ApiError('PROGRAM_WEEK_TRAINING_DAYS_INVALID', 422);
        for (const day of week.days) {
          if (day.kind === 'TRAINING')
            for (const exercise of day.workout.exercises) {
              const [row] = await query(
                m,
                `SELECT er.id FROM exercise_revisions er JOIN exercises e ON e.id=er.exercise_id WHERE er.id=$1 AND NOT e.archived AND ($2::boolean=false OR er.status='PUBLISHED') FOR SHARE OF er,e`,
                [exercise.exerciseRevisionId, publication],
              );
              if (!row) throw new ApiError('PROGRAM_EXERCISE_UNAVAILABLE', 422);
            }
          for (const slot of day.meals) {
            const [row] = await query(
              m,
              `SELECT mv.id FROM meal_versions mv JOIN meals m ON m.id=mv.meal_id JOIN meal_sections ms ON ms.id=mv.section_id WHERE mv.id=$1 AND NOT m.archived AND NOT ms.archived AND ($2::boolean=false OR (mv.status='PUBLISHED' AND mv.availability_status='AVAILABLE')) FOR SHARE OF mv,m,ms`,
              [slot.mealVersionId, publication],
            );
            if (!row) throw new ApiError('PROGRAM_MEAL_UNAVAILABLE', 422);
          }
        }
      }
  }

  private async insertSchedule(
    m: EntityManager,
    programVersionId: string,
    nutritionVersionId: string,
    input: Omit<ProgramAggregate, 'slug'>,
  ) {
    let ordinal = 0;
    for (let monthIndex = 0; monthIndex < input.months.length; monthIndex++) {
      const month = input.months[monthIndex];
      const monthId = randomUUID();
      await query(
        m,
        `INSERT INTO monthly_plans(id,program_version_id,position,title) VALUES($1,$2,$3,$4)`,
        [monthId, programVersionId, monthIndex + 1, month.title],
      );
      for (let weekIndex = 0; weekIndex < 4; weekIndex++) {
        const weekId = randomUUID();
        await query(
          m,
          `INSERT INTO plan_weeks(id,monthly_plan_id,position) VALUES($1,$2,$3)`,
          [weekId, monthId, weekIndex + 1],
        );
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const day = month.weeks[weekIndex].days[dayIndex];
          ordinal++;
          const nutritionDayId = randomUUID();
          await query(
            m,
            `INSERT INTO nutrition_template_days(id,nutrition_plan_version_id,day_position) VALUES($1,$2,$3)`,
            [nutritionDayId, nutritionVersionId, ordinal],
          );
          let workoutRevisionId: string | null = null;
          if (day.kind === 'TRAINING') {
            const workoutId = randomUUID();
            workoutRevisionId = randomUUID();
            const slug = `program-${programVersionId}-${ordinal}`;
            await query(m, `INSERT INTO workouts(id,slug) VALUES($1,$2)`, [
              workoutId,
              slug,
            ]);
            await query(
              m,
              `INSERT INTO workout_revisions(id,workout_id,version,title,description) VALUES($1,$2,1,$3,$4)`,
              [
                workoutRevisionId,
                workoutId,
                day.workout.title,
                day.workout.description,
              ],
            );
            for (
              let position = 0;
              position < day.workout.exercises.length;
              position++
            ) {
              const exercise = day.workout.exercises[position];
              const prescription = exercise.prescription;
              await query(
                m,
                `INSERT INTO workout_exercises(id,workout_revision_id,exercise_revision_id,position,set_count,reps_min,reps_max,duration_seconds,rest_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                  randomUUID(),
                  workoutRevisionId,
                  exercise.exerciseRevisionId,
                  position,
                  prescription.setCount,
                  prescription.mode === 'REPS' ? prescription.repsMin : null,
                  prescription.mode === 'REPS' ? prescription.repsMax : null,
                  prescription.mode === 'DURATION'
                    ? prescription.durationSeconds
                    : null,
                  prescription.restSeconds,
                ],
              );
            }
          }
          const planDayId = randomUUID();
          await query(
            m,
            `INSERT INTO plan_days(id,week_id,position,kind,workout_revision_id,nutrition_template_day_id) VALUES($1,$2,$3,$4,$5,$6)`,
            [
              planDayId,
              weekId,
              dayIndex + 1,
              day.kind,
              workoutRevisionId,
              nutritionDayId,
            ],
          );
          for (let position = 0; position < day.meals.length; position++) {
            const slot = day.meals[position];
            await query(
              m,
              `INSERT INTO meal_slots(id,template_day_id,position,meal_type,local_time,default_meal_version_id) VALUES($1,$2,$3,$4,$5,$6)`,
              [
                randomUUID(),
                nutritionDayId,
                position,
                slot.mealType,
                slot.localTime,
                slot.mealVersionId,
              ],
            );
          }
        }
      }
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
