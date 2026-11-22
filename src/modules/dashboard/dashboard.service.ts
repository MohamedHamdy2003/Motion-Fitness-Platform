import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { RateLimit } from '../../common/rate-limit';
import { query } from '../../infrastructure/database/query';
import { ActivityService } from '../activity/activity.service';
import { ProgramEnrollmentService } from '../enrollments/program-enrollment.service';
import { UserNutritionService } from '../nutrition/nutrition.service';

export interface CheckInCreateInput {
  workoutDifficulty: 'EASY' | 'MODERATE' | 'HARD' | 'VERY_HARD';
  nutritionAdherence: 'LOW' | 'PARTIAL' | 'HIGH' | 'COMPLETE';
  weightKg: number;
  notes?: string | null;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ProgramEnrollmentService)
    private readonly enrollment: ProgramEnrollmentService,
    @Inject(UserNutritionService)
    private readonly nutrition: UserNutritionService,
    @Inject(ActivityService)
    private readonly activity: ActivityService,
    @Inject(RateLimit)
    private readonly rateLimit: RateLimit,
  ) {}

  async dashboard(userId: string, requestedDate?: string) {
    const [profileRow] = await query(
      this.db,
      `SELECT name, gender, height_cm AS "heightCm", weight_kg AS "weightKg",
              target_weight_kg AS "targetWeightKg", primary_goal AS "primaryGoal",
              fitness_level AS "fitnessLevel", training_weekdays AS "trainingWeekdays",
              timezone, (now() AT TIME ZONE timezone)::date::text AS today
       FROM user_profiles WHERE user_id=$1`,
      [userId],
    );
    if (!profileRow) throw new ApiError('NOT_FOUND', 404);
    const date = requestedDate ?? profileRow.today;
    const [program, months, activity, checkInStatus, unreadRow] =
      await Promise.all([
        this.enrollment.current(userId),
        this.enrollment.months(userId),
        this.activity.daily(userId, date),
        this.computeCheckInStatus(this.db, userId, profileRow.today),
        query(
          this.db,
          `SELECT count(*) FILTER (WHERE read_at IS NULL)::integer AS "unreadCount"
           FROM notifications WHERE user_id=$1`,
          [userId],
        ),
      ]);

    let todayWorkout = null;
    let todayNutrition = null;

    if (program.status === 'ASSIGNED') {
      const [scheduled] = await query(
        this.db,
        `SELECT sd.id AS "scheduledDayId", sd.local_date::text AS date,
                d.kind, sd.status, wr.title AS "workoutTitle",
                (sd.local_date <= (now() AT TIME ZONE e.timezone)::date) AS "isDue",
                ws.id AS "sessionId", ws.status AS "sessionStatus"
         FROM program_enrollments e
         JOIN scheduled_days sd ON sd.enrollment_id=e.id
         JOIN plan_days d ON d.id=sd.plan_day_id
         LEFT JOIN workout_revisions wr ON wr.id=d.workout_revision_id
         LEFT JOIN workout_sessions ws ON ws.scheduled_day_id=sd.id
         WHERE e.user_id=$1 AND e.ended_at IS NULL AND sd.local_date=$2::date`,
        [userId, date],
      );
      if (scheduled) {
        todayWorkout = scheduled;
      }
      try {
        const nutritionDay = await this.nutrition.day(userId, date);
        todayNutrition = {
          id: nutritionDay.id,
          date: nutritionDay.date,
          dayNumber: nutritionDay.dayNumber,
          mealCount: nutritionDay.meals.length,
          completedMealCount: nutritionDay.meals.filter(
            (m) => m.status === 'COMPLETED',
          ).length,
          totals: nutritionDay.totals,
        };
      } catch (error) {
        if (!(
          error instanceof ApiError &&
          (error.getStatus() === 404 ||
            error.code === 'NUTRITION_PLAN_COMPLETED')
        )) {
          throw error;
        }
      }
    }

    const currentMonth =
      months.items.find((m: { status: string }) => m.status === 'SCHEDULED') ??
      months.items.at(-1) ??
      null;

    return {
      date,
      profile: {
        name: profileRow.name,
        gender: profileRow.gender,
        heightCm:
          profileRow.heightCm === null ? null : Number(profileRow.heightCm),
        weightKg:
          profileRow.weightKg === null ? null : Number(profileRow.weightKg),
        targetWeightKg:
          profileRow.targetWeightKg === null
            ? null
            : Number(profileRow.targetWeightKg),
        primaryGoal: profileRow.primaryGoal,
        fitnessLevel: profileRow.fitnessLevel,
        trainingWeekdays: profileRow.trainingWeekdays,
        timezone: profileRow.timezone,
      },
      program,
      currentMonth,
      todayWorkout,
      todayNutrition,
      activity,
      checkInStatus,
      unreadNotificationsCount: unreadRow[0]?.unreadCount ?? 0,
    };
  }

  async progress(userId: string, fromDate?: string, toDate?: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [profileRow] = await query(
        manager,
        `SELECT height_cm AS "heightCm", weight_kg AS "weightKg",
                target_weight_kg AS "targetWeightKg", timezone,
                (now() AT TIME ZONE timezone)::date::text AS today,
                ((now() AT TIME ZONE timezone)::date - 27)::text AS "defaultFrom"
         FROM user_profiles WHERE user_id=$1`,
        [userId],
      );
      if (!profileRow) throw new ApiError('NOT_FOUND', 404);
      const to = toDate ?? profileRow.today;
      const from = fromDate ?? profileRow.defaultFrom;
      if (from > to) {
        throw new ApiError(
          'INVALID_DATE_RANGE',
          422,
          'The start date must not be after the end date.',
        );
      }
      const [span] = await query(
        manager,
        'SELECT ($2::date - $1::date + 1)::integer AS days',
        [from, to],
      );
      if (span.days > 93) {
        throw new ApiError(
          'DATE_RANGE_TOO_LARGE',
          422,
          'Progress queries are bounded to at most 93 days.',
        );
      }

      const [workoutStats] = await query(
        manager,
        `SELECT count(*) FILTER (WHERE pd.kind='TRAINING')::integer AS "scheduledTrainingDays",
                count(*) FILTER (WHERE pd.kind='TRAINING' AND sd.status='COMPLETED')::integer AS "completedWorkouts",
                count(*) FILTER (WHERE pd.kind='TRAINING' AND sd.status='EXEMPT')::integer AS "exemptDays"
         FROM program_enrollments e
         JOIN scheduled_days sd ON sd.enrollment_id=e.id
         JOIN plan_days pd ON pd.id=sd.plan_day_id
         WHERE e.user_id=$1 AND e.ended_at IS NULL
           AND sd.local_date BETWEEN $2::date AND $3::date`,
        [userId, from, to],
      );

      const [setStats] = await query(
        manager,
        `SELECT count(*) FILTER (WHERE l.status='COMPLETED')::integer AS "completedSets",
                coalesce(sum(l.actual_reps) FILTER (WHERE l.status='COMPLETED'),0)::integer AS "recordedReps"
         FROM workout_sessions s
         JOIN scheduled_days sd ON sd.id=s.scheduled_day_id
         LEFT JOIN workout_set_logs l ON l.session_id=s.id
         WHERE s.user_id=$1 AND sd.local_date BETWEEN $2::date AND $3::date`,
        [userId, from, to],
      );

      const [mealStats] = await query(
        manager,
        `SELECT count(DISTINCT nd.id)::integer AS "trackedDays",
                count(sm.id)::integer AS "totalMeals",
                count(sm.id) FILTER (WHERE sm.status='COMPLETED')::integer AS "completedMeals"
         FROM program_enrollments e
         JOIN nutrition_days nd ON nd.enrollment_id=e.id
         LEFT JOIN scheduled_meals sm ON sm.nutrition_day_id=nd.id
         WHERE e.user_id=$1 AND e.ended_at IS NULL
           AND nd.local_date BETWEEN $2::date AND $3::date`,
        [userId, from, to],
      );

      const [activityStats] = await query(
        manager,
        `SELECT s.water_goal_ml AS "waterGoalMl", s.steps_goal AS "stepsGoal",
                coalesce((
                  SELECT sum(milliliters)::integer FROM water_logs
                  WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date
                ), 0) AS "totalWaterMl",
                coalesce((
                  SELECT count(*)::integer FROM (
                    SELECT local_date FROM water_logs
                    WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date
                    GROUP BY local_date HAVING sum(milliliters) >= s.water_goal_ml
                  ) w
                ), 0) AS "waterGoalReachedDays",
                coalesce((
                  SELECT sum(steps)::integer FROM daily_steps
                  WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date
                ), 0) AS "totalSteps",
                coalesce((
                  SELECT count(*)::integer FROM daily_steps
                  WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date
                    AND (manually_completed OR steps >= s.steps_goal)
                ), 0) AS "stepsGoalReachedDays"
         FROM user_settings s WHERE s.user_id=$1`,
        [userId, from, to],
      );

      const weightHistory = await this.readWeightHistory(
        manager,
        userId,
        from,
        to,
        profileRow.weightKg === null ? null : Number(profileRow.weightKg),
        profileRow.targetWeightKg === null
          ? null
          : Number(profileRow.targetWeightKg),
      );
      const checkInStatus = await this.computeCheckInStatus(
        manager,
        userId,
        profileRow.today,
      );

      const denominator =
        workoutStats.scheduledTrainingDays - workoutStats.exemptDays;
      const adherence =
        denominator > 0
          ? Number((workoutStats.completedWorkouts / denominator).toFixed(4))
          : null;

      return {
        from,
        to,
        workouts: {
          ...workoutStats,
          completedSets: setStats.completedSets,
          recordedReps: setStats.recordedReps,
          adherence,
        },
        nutrition: mealStats,
        activity: activityStats,
        measurements: {
          heightCm:
            profileRow.heightCm === null ? null : Number(profileRow.heightCm),
          weightKg:
            profileRow.weightKg === null ? null : Number(profileRow.weightKg),
          targetWeightKg:
            profileRow.targetWeightKg === null
              ? null
              : Number(profileRow.targetWeightKg),
        },
        weightHistory,
        checkInStatus,
      };
    });
  }

  async weightHistory(userId: string, fromDate?: string, toDate?: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [profileRow] = await query(
        manager,
        `SELECT weight_kg AS "weightKg", target_weight_kg AS "targetWeightKg",
                (now() AT TIME ZONE timezone)::date::text AS today,
                ((now() AT TIME ZONE timezone)::date - 89)::text AS "defaultFrom"
         FROM user_profiles WHERE user_id=$1`,
        [userId],
      );
      if (!profileRow) throw new ApiError('NOT_FOUND', 404);
      const to = toDate ?? profileRow.today;
      const from = fromDate ?? profileRow.defaultFrom;
      if (from > to) {
        throw new ApiError(
          'INVALID_DATE_RANGE',
          422,
          'The start date must not be after the end date.',
        );
      }
      return this.readWeightHistory(
        manager,
        userId,
        from,
        to,
        profileRow.weightKg === null ? null : Number(profileRow.weightKg),
        profileRow.targetWeightKg === null
          ? null
          : Number(profileRow.targetWeightKg),
      );
    });
  }

  private async readWeightHistory(
    manager: DataSource | EntityManager,
    userId: string,
    from: string,
    to: string,
    currentProfileWeightKg: number | null,
    targetWeightKg: number | null,
  ) {
    const rows = await query(
      manager,
      `SELECT id, local_date::text AS date, weight_kg AS "weightKg",
              source, created_at AS "createdAt"
       FROM weight_logs
       WHERE user_id=$1 AND local_date BETWEEN $2::date AND $3::date
       ORDER BY local_date ASC, created_at ASC`,
      [userId, from, to],
    );
    const items = rows.map(
      (row: {
        id: string;
        date: string;
        weightKg: string | number;
        source: string;
        createdAt: string;
      }) => ({
        ...row,
        weightKg: Number(row.weightKg),
      }),
    );
    const startWeightKg = items[0]?.weightKg ?? currentProfileWeightKg;
    const currentWeightKg = items.at(-1)?.weightKg ?? currentProfileWeightKg;
    const changeKg =
      startWeightKg !== null && currentWeightKg !== null
        ? Number((currentWeightKg - startWeightKg).toFixed(2))
        : null;
    return {
      from,
      to,
      startWeightKg,
      currentWeightKg,
      targetWeightKg,
      changeKg,
      items,
    };
  }

  async listCheckIns(userId: string, limit: number, offset: number) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [profileRow] = await query(
        manager,
        `SELECT (now() AT TIME ZONE timezone)::date::text AS today
         FROM user_profiles WHERE user_id=$1`,
        [userId],
      );
      if (!profileRow) throw new ApiError('NOT_FOUND', 404);
      const status = await this.computeCheckInStatus(
        manager,
        userId,
        profileRow.today,
      );
      const rows = await query(
        manager,
        `SELECT id, enrollment_id AS "enrollmentId", local_date::text AS date,
                workout_difficulty AS "workoutDifficulty",
                nutrition_adherence AS "nutritionAdherence",
                weight_kg AS "weightKg", notes,
                automated_summary AS "automatedSummary",
                next_check_in_date::text AS "nextCheckInDate",
                created_at AS "createdAt"
         FROM user_check_ins
         WHERE user_id=$1
         ORDER BY local_date DESC, created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );
      return {
        ...status,
        items: rows.map((row: { weightKg: string | number }) => ({
          ...row,
          weightKg: Number(row.weightKg),
        })),
        limit,
        offset,
      };
    });
  }

  async submitCheckIn(userId: string, input: CheckInCreateInput) {
    await this.rateLimit.take('check-in', userId, 10, 900);
    return this.db.transaction(async (manager) => {
      const [user] = await query(
        manager,
        "SELECT id FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
        [userId],
      );
      if (!user) throw new ApiError('ACCOUNT_UNAVAILABLE', 403);

      const [profileRow] = await query(
        manager,
        `SELECT weight_kg AS "previousWeightKg", target_weight_kg AS "targetWeightKg",
                primary_goal AS "primaryGoal", timezone,
                (now() AT TIME ZONE timezone)::date::text AS today,
                ((now() AT TIME ZONE timezone)::date + 3)::text AS "nextCheckInDate",
                ((now() AT TIME ZONE timezone)::date - 2)::text AS "windowStart"
         FROM user_profiles WHERE user_id=$1 FOR UPDATE`,
        [userId],
      );
      if (!profileRow) throw new ApiError('NOT_FOUND', 404);

      const [enrollmentRow] = await query(
        manager,
        `SELECT id FROM program_enrollments
         WHERE user_id=$1 AND ended_at IS NULL LIMIT 1`,
        [userId],
      );
      const enrollmentId = enrollmentRow?.id ?? null;

      await query(
        manager,
        `UPDATE user_profiles
         SET weight_kg=$2, profile_revision=profile_revision+1
         WHERE user_id=$1`,
        [userId, input.weightKg],
      );
      await query(
        manager,
        `INSERT INTO weight_logs(id, user_id, local_date, weight_kg, source)
         VALUES($1, $2, $3::date, $4, 'CHECK_IN')
         ON CONFLICT (user_id, local_date) DO UPDATE
           SET weight_kg=EXCLUDED.weight_kg, source='CHECK_IN', created_at=now()`,
        [randomUUID(), userId, profileRow.today, input.weightKg],
      );

      const [recentStats] = await query(
        manager,
        `SELECT
           coalesce((
             SELECT count(*)::integer
             FROM scheduled_days sd
             JOIN program_enrollments e ON e.id = sd.enrollment_id
             JOIN plan_days pd ON pd.id = sd.plan_day_id
             WHERE e.user_id = $1 AND e.ended_at IS NULL
               AND pd.kind = 'TRAINING' AND sd.status = 'COMPLETED'
               AND sd.local_date BETWEEN $2::date AND $3::date
           ), 0) AS "completedWorkouts",
           coalesce((
             SELECT count(sm.id) FILTER (WHERE sm.status = 'COMPLETED')::integer
             FROM nutrition_days nd
             JOIN program_enrollments e ON e.id = nd.enrollment_id
             JOIN scheduled_meals sm ON sm.nutrition_day_id = nd.id
             WHERE e.user_id = $1 AND e.ended_at IS NULL
               AND nd.local_date BETWEEN $2::date AND $3::date
           ), 0) AS "completedMeals"`,
        [userId, profileRow.windowStart, profileRow.today],
      );

      const previousWeight =
        profileRow.previousWeightKg === null
          ? null
          : Number(profileRow.previousWeightKg);
      const targetWeight =
        profileRow.targetWeightKg === null
          ? null
          : Number(profileRow.targetWeightKg);
      const automatedSummary = this.buildAutomatedSummary({
        weightKg: input.weightKg,
        previousWeightKg: previousWeight,
        targetWeightKg: targetWeight,
        workoutDifficulty: input.workoutDifficulty,
        nutritionAdherence: input.nutritionAdherence,
        completedWorkouts: recentStats?.completedWorkouts ?? 0,
        completedMeals: recentStats?.completedMeals ?? 0,
      });

      const checkInId = randomUUID();
      const [inserted] = await query(
        manager,
        `INSERT INTO user_check_ins(
           id, user_id, enrollment_id, local_date,
           workout_difficulty, nutrition_adherence,
           weight_kg, notes, automated_summary, next_check_in_date
         )
         VALUES($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10::date)
         RETURNING id, enrollment_id AS "enrollmentId", local_date::text AS date,
                   workout_difficulty AS "workoutDifficulty",
                   nutrition_adherence AS "nutritionAdherence",
                   weight_kg AS "weightKg", notes,
                   automated_summary AS "automatedSummary",
                   next_check_in_date::text AS "nextCheckInDate",
                   created_at AS "createdAt"`,
        [
          checkInId,
          userId,
          enrollmentId,
          profileRow.today,
          input.workoutDifficulty,
          input.nutritionAdherence,
          input.weightKg,
          input.notes ?? null,
          automatedSummary,
          profileRow.nextCheckInDate,
        ],
      );

      await query(
        manager,
        `INSERT INTO notifications(id, user_id, type, title, body, payload)
         VALUES($1, $2, 'CHECKIN_COMPLETED', 'Check-in recorded', $3, $4)`,
        [
          randomUUID(),
          userId,
          automatedSummary,
          JSON.stringify({
            checkInId,
            date: profileRow.today,
            nextCheckInDate: profileRow.nextCheckInDate,
            weightKg: input.weightKg,
          }),
        ],
      );

      return {
        ...inserted,
        weightKg: Number(inserted.weightKg),
        status: 'UPCOMING',
        daysUntilDue: 3,
      };
    });
  }

  private async computeCheckInStatus(
    manager: DataSource | EntityManager,
    userId: string,
    today: string,
  ) {
    const [latest] = await query(
      manager,
      `SELECT local_date::text AS "lastCheckInDate",
              next_check_in_date::text AS "nextDueDate",
              greatest(0, (next_check_in_date - $2::date))::integer AS "daysUntilDue"
       FROM user_check_ins
       WHERE user_id=$1
       ORDER BY local_date DESC, created_at DESC, id DESC
       LIMIT 1`,
      [userId, today],
    );
    if (!latest) {
      return {
        status: 'DUE' as const,
        lastCheckInDate: null,
        nextDueDate: today,
        daysUntilDue: 0,
      };
    }
    return {
      status:
        latest.nextDueDate <= today ? ('DUE' as const) : ('UPCOMING' as const),
      lastCheckInDate: latest.lastCheckInDate,
      nextDueDate: latest.nextDueDate,
      daysUntilDue: latest.daysUntilDue,
    };
  }

  private buildAutomatedSummary(params: {
    weightKg: number;
    previousWeightKg: number | null;
    targetWeightKg: number | null;
    workoutDifficulty: CheckInCreateInput['workoutDifficulty'];
    nutritionAdherence: CheckInCreateInput['nutritionAdherence'];
    completedWorkouts: number;
    completedMeals: number;
  }): string {
    const parts: string[] = [];
    if (
      params.previousWeightKg !== null &&
      params.previousWeightKg !== params.weightKg
    ) {
      const delta = Number(
        (params.weightKg - params.previousWeightKg).toFixed(2),
      );
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      parts.push(
        `Weight logged at ${params.weightKg} kg (${sign} kg since your previous reading).`,
      );
    } else {
      parts.push(`Weight logged at ${params.weightKg} kg.`);
    }

    if (params.targetWeightKg !== null) {
      const remaining = Number(
        Math.abs(params.targetWeightKg - params.weightKg).toFixed(2),
      );
      parts.push(`You are ${remaining} kg away from your target weight.`);
    }

    parts.push(
      `Over the last 3 days you completed ${params.completedWorkouts} workout(s) and ${params.completedMeals} logged meal(s).`,
    );

    if (
      params.workoutDifficulty === 'VERY_HARD' ||
      params.workoutDifficulty === 'HARD'
    ) {
      parts.push(
        'Training felt demanding—prioritize full rest intervals between sets and adequate sleep before your next session.',
      );
    } else {
      parts.push(
        'Training intensity is well controlled—keep focusing on clean execution and steady progression.',
      );
    }

    if (
      params.nutritionAdherence === 'LOW' ||
      params.nutritionAdherence === 'PARTIAL'
    ) {
      parts.push(
        'Use same-section meal or ingredient swaps whenever you need easier meal prep while staying on your daily macro targets.',
      );
    } else {
      parts.push(
        'Strong nutrition consistency—continue hitting your scheduled meals and daily hydration target.',
      );
    }

    return parts.join(' ');
  }
}
