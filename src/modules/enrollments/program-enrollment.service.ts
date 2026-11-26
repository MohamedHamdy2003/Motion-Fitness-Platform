import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { ExerciseFittingService } from '../fitting/fitting.service';
import { MediaService } from '../media/media.service';
import {
  PushNotificationPayload,
  PushNotificationService,
} from '../notifications/push-notification.service';

@Injectable()
export class ProgramEnrollmentService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(ExerciseFittingService)
    private readonly fitting: ExerciseFittingService,
    @Optional()
    @Inject(PushNotificationService)
    private readonly push?: PushNotificationService,
  ) {}

  // Matching holds the user lock and writes the validated decision in this transaction.
  async assignFirst(
    manager: EntityManager,
    userId: string,
    runId: string,
    programVersionId: string,
  ): Promise<PushNotificationPayload | null> {
    const [history] = await query(
      manager,
      'SELECT id,program_version_id FROM program_enrollments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    if (history) {
      const [notification] = (await query(
        manager,
        `INSERT INTO notifications(id,user_id,type,title,body,payload)
         SELECT $1,$2,'PROGRAM_CHANGE_READY','New program recommendation available',
                'Based on your updated profile, ' || pv.title || ' is ready to review and activate.',
                jsonb_build_object(
                  'recommendationRunId', $3::text,
                  'programVersionId', pv.id::text,
                  'title', pv.title
                )
         FROM program_versions pv WHERE pv.id=$4
         RETURNING id, type, title, body, payload`,
        [randomUUID(), userId, runId, programVersionId],
      )) as PushNotificationPayload[];
      return notification ?? null;
    }
    const { notification } = await this.createEnrollment(
      manager,
      userId,
      runId,
      programVersionId,
    );
    return notification;
  }

  private async createEnrollment(
    manager: EntityManager,
    userId: string,
    runId: string,
    programVersionId: string,
  ): Promise<{
    enrollmentId: string;
    notification: PushNotificationPayload | null;
  }> {
    const [enrollment] = await query(
      manager,
      `INSERT INTO program_enrollments(id,user_id,recommendation_run_id,program_version_id,starts_on,timezone,training_weekdays)
       SELECT $1,p.user_id,r.id,pv.id,(now() AT TIME ZONE p.timezone)::date,p.timezone,p.training_weekdays
       FROM user_profiles p
       JOIN recommendation_runs r ON r.id=$3 AND r.user_id=p.user_id AND r.kind='USER' AND r.status='MATCH'
       JOIN program_versions pv ON pv.id=$4 AND r.decision->>'selectedProgramVersionId'=pv.id::text AND pv.status='PUBLISHED'
       JOIN programs pg ON pg.id=pv.program_id AND NOT pg.archived
       JOIN nutrition_plan_versions np ON np.id=pv.nutrition_plan_version_id AND np.status='PUBLISHED'
       WHERE p.user_id=$2 AND cardinality(p.training_weekdays)=pv.training_days_per_week
       FOR SHARE OF pg
       RETURNING id,starts_on::text`,
      [randomUUID(), userId, runId, programVersionId],
    );
    if (!enrollment) throw this.scheduleUnavailable();

    await this.scheduleMonth(manager, enrollment.id, 1, enrollment.starts_on);
    const [notification] = (await query(
      manager,
      `INSERT INTO notifications(id,user_id,type,title,body,payload)
       SELECT $1,$2,'PROGRAM_READY','Your program is ready',
              'Your ' || pv.title || ' training and nutrition schedule is ready.',
              jsonb_build_object(
                'enrollmentId', $3::text,
                'recommendationRunId', $4::text,
                'programVersionId', pv.id::text,
                'title', pv.title
              )
       FROM program_versions pv WHERE pv.id=$5
       RETURNING id, type, title, body, payload`,
      [randomUUID(), userId, enrollment.id, runId, programVersionId],
    )) as PushNotificationPayload[];
    return {
      enrollmentId: enrollment.id as string,
      notification: notification ?? null,
    };
  }

  async acceptProgramChange(userId: string, recommendationRunId: string) {
    let pendingNotification: PushNotificationPayload | null = null;
    const result = await this.db.transaction(async (manager) => {
      const [user] = await query(
        manager,
        "SELECT id FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
        [userId],
      );
      if (!user) throw new ApiError('ACCOUNT_UNAVAILABLE', 403);

      const [active] = await query(
        manager,
        'SELECT id,recommendation_run_id FROM program_enrollments WHERE user_id=$1 AND ended_at IS NULL FOR UPDATE',
        [userId],
      );
      if (active?.recommendation_run_id === recommendationRunId) {
        return this.readCurrent(manager, userId);
      }

      const [latestRun] = await query(
        manager,
        `SELECT id,status,decision->>'selectedProgramVersionId' AS "selectedProgramVersionId"
         FROM recommendation_runs
         WHERE user_id=$1 AND kind='USER'
         ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
        [userId],
      );
      if (
        !latestRun ||
        latestRun.id !== recommendationRunId ||
        latestRun.status !== 'MATCH' ||
        !latestRun.selectedProgramVersionId
      ) {
        throw new ApiError(
          'PROGRAM_CHANGE_UNAVAILABLE',
          409,
          'This program recommendation is no longer current or eligible for activation.',
        );
      }

      await query(
        manager,
        `UPDATE workout_sessions SET status='ABANDONED'
         WHERE user_id=$1 AND status='IN_PROGRESS'`,
        [userId],
      );
      await query(
        manager,
        `UPDATE program_enrollments SET ended_at=now()
         WHERE user_id=$1 AND ended_at IS NULL`,
        [userId],
      );
      const { notification } = await this.createEnrollment(
        manager,
        userId,
        recommendationRunId,
        latestRun.selectedProgramVersionId,
      );
      pendingNotification = notification;
      return this.readCurrent(manager, userId);
    });
    if (pendingNotification) {
      this.push?.dispatchAsync(userId, pendingNotification);
    }
    return result;
  }

  async activeId(
    manager: EntityManager,
    userId: string,
  ): Promise<string | null> {
    const [enrollment] = await query(
      manager,
      'SELECT id FROM program_enrollments WHERE user_id=$1 AND ended_at IS NULL',
      [userId],
    );
    return enrollment?.id ?? null;
  }

  // The caller holds the user lock around the final workout resolution.
  async scheduleNextMonth(manager: EntityManager, userId: string) {
    const [month] = await query(
      manager,
      `SELECT e.id AS enrollment_id,current_month.id AS monthly_plan_id,next_month.position,
        (greatest(last_day.local_date, resolution.resolved_date)+1)::text AS starts_on
       FROM program_enrollments e
       JOIN LATERAL (SELECT * FROM scheduled_days WHERE enrollment_id=e.id ORDER BY local_date DESC LIMIT 1) last_day ON true
       JOIN plan_days d ON d.id=last_day.plan_day_id
       JOIN plan_weeks w ON w.id=d.week_id
       JOIN monthly_plans current_month ON current_month.id=w.monthly_plan_id
       LEFT JOIN monthly_plans next_month ON next_month.program_version_id=e.program_version_id AND next_month.position=current_month.position+1
       JOIN LATERAL (
         SELECT count(*) FILTER (WHERE sd.status='SCHEDULED') AS remaining,
                max((sd.resolved_at AT TIME ZONE e.timezone)::date) AS resolved_date
         FROM scheduled_days sd JOIN plan_days pd ON pd.id=sd.plan_day_id
         JOIN plan_weeks pw ON pw.id=pd.week_id
         WHERE sd.enrollment_id=e.id AND pw.monthly_plan_id=current_month.id AND pd.kind='TRAINING'
       ) resolution ON resolution.remaining=0
       WHERE e.user_id=$1 AND e.ended_at IS NULL`,
      [userId],
    );
    if (!month) return;

    await query(
      manager,
      `INSERT INTO completed_training_months(enrollment_id, monthly_plan_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [month.enrollment_id, month.monthly_plan_id],
    );
    if (month.position !== null)
      await this.scheduleMonth(
        manager,
        month.enrollment_id,
        month.position,
        month.starts_on,
      );
  }

  private async scheduleMonth(
    manager: EntityManager,
    enrollmentId: string,
    position: number,
    startsOn: string,
  ) {
    // Keep the order of training and rest slots within each template week.
    // Nutrition stays in its original date order, independent of moved workouts.
    const days = await query(
      manager,
      `WITH context AS (
         SELECT e.training_weekdays,pv.nutrition_plan_version_id,mp.id AS month_id
         FROM program_enrollments e JOIN program_versions pv ON pv.id=e.program_version_id
         JOIN monthly_plans mp ON mp.program_version_id=pv.id AND mp.position=$2
         WHERE e.id=$1
       ), dates AS (
         SELECT n, n/7+1 AS week_position, $3::date+n AS local_date,
                CASE WHEN (ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'])[1+extract(dow FROM ($3::date+n))::int]
                          = ANY(c.training_weekdays) THEN 'TRAINING' ELSE 'REST' END AS kind
         FROM context c CROSS JOIN generate_series(0,27) n
       ), calendar AS (
         SELECT *, row_number() OVER (PARTITION BY week_position,kind ORDER BY n) AS slot FROM dates
       ), template AS (
         SELECT d.id, w.position AS week_position,d.kind,
                row_number() OVER (PARTITION BY w.position,d.kind ORDER BY d.position) AS slot
         FROM context c JOIN plan_weeks w ON w.monthly_plan_id=c.month_id
         JOIN plan_days d ON d.week_id=w.id
       )
       INSERT INTO scheduled_days(id,enrollment_id,plan_day_id,nutrition_template_day_id,local_date)
       SELECT gen_random_uuid(),$1,t.id,nd.id,cal.local_date
       FROM calendar cal JOIN template t USING (week_position,kind,slot)
       CROSS JOIN context c
       JOIN nutrition_template_days nd ON nd.nutrition_plan_version_id=c.nutrition_plan_version_id
           AND nd.day_position=($2-1)*28+cal.n+1
       RETURNING id`,
      [enrollmentId, position, startsOn],
    );
    if (days.length !== 28) throw this.scheduleUnavailable();
  }

  private scheduleUnavailable() {
    return new ApiError(
      'PROGRAM_SCHEDULE_UNAVAILABLE',
      409,
      'The selected program does not have a complete schedule for these training days.',
    );
  }

  async current(userId: string) {
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.readCurrent(manager, userId),
    );
  }

  private async readCurrent(manager: EntityManager, userId: string) {
    const [assigned] = await query(
      manager,
      `SELECT e.id AS "enrollmentId", e.recommendation_run_id AS "recommendationRunId",
              e.starts_on::text AS "startsOn", e.timezone, e.training_weekdays AS "trainingWeekdays",
              (now() AT TIME ZONE e.timezone)::date::text AS "localToday",
              pv.program_id AS "programId", pv.id AS "programVersionId",
              pv.nutrition_plan_version_id AS "nutritionPlanVersionId", pv.title, pv.description
       FROM program_enrollments e JOIN program_versions pv ON pv.id=e.program_version_id
       WHERE e.user_id=$1 AND e.ended_at IS NULL`,
      [userId],
    );
    const [run] = await query(
      manager,
      `SELECT r.id,r.status,r.failure_code,r.decision->>'selectedProgramVersionId' AS "selectedProgramVersionId",
              pv.title AS "selectedProgramTitle"
       FROM recommendation_runs r
       LEFT JOIN program_versions pv ON pv.id::text=r.decision->>'selectedProgramVersionId'
       WHERE r.user_id=$1 AND r.kind='USER'
       ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,
      [userId],
    );
    if (assigned) {
      const pendingProposal =
        run &&
        run.status === 'MATCH' &&
        run.id !== assigned.recommendationRunId &&
        run.selectedProgramVersionId
          ? {
              recommendationRunId: run.id,
              programVersionId: run.selectedProgramVersionId,
              title: run.selectedProgramTitle ?? null,
            }
          : null;
      return { status: 'ASSIGNED', ...assigned, pendingProposal };
    }

    const status =
      run?.status === 'PENDING' || run?.status === 'PROCESSING'
        ? 'PREPARING'
        : run?.status === 'NO_MATCH' || run?.status === 'FAILED'
          ? run.status
          : 'NOT_ASSIGNED';
    return {
      status,
      enrollmentId: null,
      recommendationRunId: run?.id ?? null,
      failureCode: run?.failure_code ?? null,
    };
  }

  async months(userId: string) {
    const rows = await query(
      this.db,
      `SELECT mp.id,mp.position,mp.title,
              CASE WHEN done.completed_at IS NOT NULL THEN 'COMPLETED'
                   WHEN min(sd.local_date) IS NULL THEN 'LOCKED'
                   ELSE 'SCHEDULED' END AS status,
              min(sd.local_date)::text AS "startsOn",
              max(sd.local_date)::text AS "endsOn",
              count(d.id) FILTER (WHERE d.kind='TRAINING')::integer AS "trainingDayCount",
              count(sd.id) FILTER (WHERE d.kind='TRAINING' AND sd.status='COMPLETED')::integer AS "completedWorkoutCount",
              count(sd.id) FILTER (WHERE d.kind='TRAINING' AND sd.status='EXEMPT')::integer AS "exemptDayCount"
       FROM program_enrollments e JOIN monthly_plans mp ON mp.program_version_id=e.program_version_id
       LEFT JOIN plan_weeks w ON w.monthly_plan_id=mp.id
       LEFT JOIN plan_days d ON d.week_id=w.id
       LEFT JOIN scheduled_days sd ON sd.plan_day_id=d.id AND sd.enrollment_id=e.id
       LEFT JOIN completed_training_months done ON done.enrollment_id=e.id AND done.monthly_plan_id=mp.id
       WHERE e.user_id=$1 AND e.ended_at IS NULL
       GROUP BY mp.id, done.completed_at
       ORDER BY mp.position`,
      [userId],
    );
    const items = rows.map(
      (row: {
        id: string;
        position: number;
        title: string;
        status: string;
        startsOn: string | null;
        endsOn: string | null;
        trainingDayCount: number;
        completedWorkoutCount: number;
        exemptDayCount: number;
      }) => {
        const trainingDayCount = row.trainingDayCount;
        const completedWorkoutCount = row.completedWorkoutCount;
        const exemptDayCount = row.exemptDayCount;
        const pendingTrainingDayCount = Math.max(
          0,
          trainingDayCount - completedWorkoutCount - exemptDayCount,
        );
        const unlockProgress =
          trainingDayCount > 0
            ? Number(
                (
                  (completedWorkoutCount + exemptDayCount) /
                  trainingDayCount
                ).toFixed(4),
              )
            : 0;
        const adherenceDenominator = trainingDayCount - exemptDayCount;
        const exerciseAdherence =
          adherenceDenominator > 0
            ? Number((completedWorkoutCount / adherenceDenominator).toFixed(4))
            : null;
        return {
          ...row,
          pendingTrainingDayCount,
          unlockProgress,
          exerciseAdherence,
        };
      },
    );
    return { items };
  }

  async weeks(userId: string, monthId: string) {
    const items = await query(
      this.db,
      `SELECT w.id,w.position,min(sd.local_date)::text AS "startsOn",max(sd.local_date)::text AS "endsOn"
       FROM program_enrollments e JOIN monthly_plans mp ON mp.program_version_id=e.program_version_id
       JOIN plan_weeks w ON w.monthly_plan_id=mp.id JOIN plan_days d ON d.week_id=w.id
       JOIN scheduled_days sd ON sd.plan_day_id=d.id AND sd.enrollment_id=e.id
       WHERE e.user_id=$1 AND e.ended_at IS NULL AND mp.id=$2 GROUP BY w.id ORDER BY w.position`,
      [userId, monthId],
    );
    if (!items.length) throw new ApiError('NOT_FOUND', 404);
    return { items };
  }

  async weekDays(userId: string, weekId: string) {
    const items = await query(
      this.db,
      `SELECT sd.id,sd.local_date::text AS date,d.kind,sd.status,wr.title AS "workoutTitle",
              sd.local_date<=(now() AT TIME ZONE e.timezone)::date AS "isDue"
       FROM program_enrollments e JOIN scheduled_days sd ON sd.enrollment_id=e.id
       JOIN plan_days d ON d.id=sd.plan_day_id LEFT JOIN workout_revisions wr ON wr.id=d.workout_revision_id
       WHERE e.user_id=$1 AND e.ended_at IS NULL AND d.week_id=$2 ORDER BY sd.local_date`,
      [userId, weekId],
    );
    if (!items.length) throw new ApiError('NOT_FOUND', 404);
    return { items };
  }

  async day(userId: string, date: string) {
    const [day] = await query(
      this.db,
      `SELECT sd.id,sd.local_date::text AS date,d.kind,sd.status,sd.nutrition_template_day_id AS "nutritionTemplateDayId",
              wr.id AS "workoutRevisionId",wr.title AS "workoutTitle",wr.description AS "workoutDescription",
              sd.local_date<=(now() AT TIME ZONE e.timezone)::date AS "isDue",
              ws.id AS "sessionId",ws.status AS "sessionStatus",
              ws.started_at AS "sessionStartedAt",ws.completed_at AS "sessionCompletedAt"
       FROM program_enrollments e JOIN scheduled_days sd ON sd.enrollment_id=e.id
       JOIN plan_days d ON d.id=sd.plan_day_id
       LEFT JOIN workout_revisions wr ON wr.id=d.workout_revision_id
       LEFT JOIN workout_sessions ws ON ws.scheduled_day_id=sd.id
       WHERE e.user_id=$1 AND e.ended_at IS NULL AND sd.local_date=$2::date`,
      [userId, date],
    );
    if (!day) throw new ApiError('NOT_FOUND', 404);

    const {
      workoutRevisionId,
      workoutTitle,
      workoutDescription,
      sessionId,
      sessionStatus,
      sessionStartedAt,
      sessionCompletedAt,
      ...summary
    } = day;
    const meals = await query(
      this.db,
      `SELECT ms.id,ms.position,ms.meal_type AS "mealType",ms.local_time::text AS "localTime",
              COALESCE(sm.selected_meal_version_id,ms.default_meal_version_id) AS "mealVersionId",
              mv.title,
              sm.id AS "scheduledMealId",
              COALESCE(sm.status,'PENDING') AS status
       FROM meal_slots ms
       LEFT JOIN nutrition_days nd ON nd.template_day_id=ms.template_day_id AND nd.enrollment_id=(
         SELECT enrollment_id FROM scheduled_days WHERE id=$2
       )
       LEFT JOIN scheduled_meals sm ON sm.nutrition_day_id=nd.id AND sm.meal_slot_id=ms.id
       JOIN meal_versions mv ON mv.id=COALESCE(sm.selected_meal_version_id,ms.default_meal_version_id)
       WHERE ms.template_day_id=$1 ORDER BY ms.position`,
      [day.nutritionTemplateDayId, day.id],
    );
    const workoutSession = sessionId
      ? {
          id: sessionId,
          status: sessionStatus,
          startedAt: sessionStartedAt,
          completedAt: sessionCompletedAt,
        }
      : null;

    if (!workoutRevisionId) {
      return {
        ...summary,
        meals,
        workout: null,
        workoutSession,
        fitting: null,
      };
    }

    const exercises = await query(
      this.db,
      `SELECT we.id,we.exercise_revision_id AS "exerciseRevisionId",we.position,
              we.set_count AS "setCount",we.reps_min AS "repsMin",we.reps_max AS "repsMax",
              we.duration_seconds AS "durationSeconds",we.rest_seconds AS "restSeconds",
              er.content->>'title' AS title,er.content->>'description' AS description,
              er.content->'instructions' AS instructions,er.content->'muscleGroups' AS "muscleGroups",
              er.content->'equipment' AS equipment,ma.id AS "videoMediaId"
       FROM workout_exercises we JOIN exercise_revisions er ON er.id=we.exercise_revision_id
       LEFT JOIN media_assets ma ON ma.id=er.media_id AND ma.mime='video/mp4' AND ma.status='READY'
           AND ma.library_asset AND NOT ma.library_archived
       WHERE we.workout_revision_id=$1 ORDER BY we.position`,
      [workoutRevisionId],
    );

    if (!day.isDue) {
      return {
        ...summary,
        meals,
        workout: {
          id: workoutRevisionId,
          title: workoutTitle,
          description: workoutDescription,
          exercises: exercises.map(({ videoMediaId, ...exercise }) => {
            void videoMediaId;
            return { ...exercise, restrictionStatus: null, video: null };
          }),
        },
        workoutSession,
        fitting: null,
      };
    }

    const fitting = await this.fitting.evaluate(userId, day.id);
    const decisions = new Map(
      fitting.decisions.map(
        (decision) => [decision.workoutExerciseId, decision.status] as const,
      ),
    );
    const hasActionableDecisions = [
      'READY',
      'NEEDS_REVIEW',
      'NOT_REQUIRED',
    ].includes(fitting.status);
    const items = await Promise.all(
      exercises.map(async ({ videoMediaId, ...exercise }) => {
        const restrictionStatus = decisions.get(exercise.id) ?? null;
        let video = null;
        if (
          videoMediaId &&
          hasActionableDecisions &&
          restrictionStatus === 'NO_IDENTIFIED_CONFLICT'
        ) {
          try {
            video = await this.media.get(null, videoMediaId);
          } catch (error) {
            if (!(
              error instanceof ApiError &&
              error.code === 'STORAGE_NOT_CONFIGURED'
            )) {
              throw error;
            }
          }
        }
        return { ...exercise, restrictionStatus, video };
      }),
    );
    return {
      ...summary,
      meals,
      workout: {
        id: workoutRevisionId,
        title: workoutTitle,
        description: workoutDescription,
        exercises: items,
      },
      workoutSession,
      fitting: {
        status: fitting.status,
        runId: fitting.runId,
        failureCode: fitting.failureCode,
      },
    };
  }
}
