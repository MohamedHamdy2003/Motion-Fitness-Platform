import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { ProgramEnrollmentService } from '../enrollments/program-enrollment.service';
import { ExerciseFittingService } from '../fitting/fitting.service';
import { WorkoutSetInput } from './workout.dto';

@Injectable()
export class WorkoutService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ProgramEnrollmentService)
    private readonly enrollment: ProgramEnrollmentService,
    @Inject(ExerciseFittingService)
    private readonly fitting: ExerciseFittingService,
  ) {}

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

  private async session(
    manager: EntityManager,
    userId: string,
    sessionId: string,
  ) {
    const [session] = await query(
      manager,
      `SELECT s.id,s.status,s.scheduled_day_id AS "scheduledDayId",s.started_at AS "startedAt",
          s.completed_at AS "completedAt",sd.local_date::text AS date,pd.workout_revision_id AS "workoutRevisionId",
          (e.ended_at IS NULL) AS "enrollmentActive"
       FROM workout_sessions s JOIN scheduled_days sd ON sd.id=s.scheduled_day_id
       JOIN program_enrollments e ON e.id=sd.enrollment_id JOIN plan_days pd ON pd.id=sd.plan_day_id
       WHERE s.id=$1 AND s.user_id=$2 AND e.user_id=$2`,
      [sessionId, userId],
    );
    if (!session) throw new ApiError('NOT_FOUND', 404);
    return session;
  }

  private async ready(manager: EntityManager, userId: string, dayId: string) {
    const assessment = await this.fitting.current(userId, dayId, manager);
    if (
      !['NOT_REQUIRED', 'READY', 'NEEDS_REVIEW'].includes(assessment.status)
    ) {
      throw new ApiError(
        'WORKOUT_ASSESSMENT_REQUIRED',
        409,
        'Check this day’s exercise assessment before logging your workout.',
        {
          status: assessment.status,
          runId: assessment.runId,
          failureCode: assessment.failureCode,
        },
      );
    }
    return {
      assessment,
      decisions: new Map(
        assessment.decisions.map((decision) => [
          decision.workoutExerciseId,
          decision.status,
        ]),
      ),
    };
  }

  async start(userId: string, dayId: string) {
    await this.fitting.evaluate(userId, dayId);
    return this.withUser(userId, async (manager) => {
      const [day] = await query(
        manager,
        `SELECT sd.status,sd.exemption_fitting_run_id AS "assessmentRunId",
           sd.local_date<=(now() AT TIME ZONE e.timezone)::date AS due,pd.kind
         FROM scheduled_days sd JOIN program_enrollments e ON e.id=sd.enrollment_id
         JOIN plan_days pd ON pd.id=sd.plan_day_id WHERE sd.id=$1 AND e.user_id=$2 AND e.ended_at IS NULL`,
        [dayId, userId],
      );
      if (!day) throw new ApiError('NOT_FOUND', 404);
      if (day.status === 'EXEMPT') {
        return {
          id: null,
          scheduledDayId: dayId,
          status: 'EXEMPT',
          assessmentRunId: day.assessmentRunId,
        };
      }
      if (!day.due || day.kind !== 'TRAINING' || day.status !== 'SCHEDULED') {
        throw new ApiError(
          'WORKOUT_DAY_UNAVAILABLE',
          409,
          'This workout day is unavailable.',
        );
      }
      const { assessment, decisions } = await this.ready(
        manager,
        userId,
        dayId,
      );
      if (
        assessment.runId &&
        decisions.size &&
        [...decisions.values()].every((status) => status === 'BLOCKED')
      ) {
        await query(
          manager,
          `
          UPDATE scheduled_days SET status='EXEMPT',resolved_at=now(),exemption_fitting_run_id=$2
          WHERE id=$1
        `,
          [dayId, assessment.runId],
        );
        await query(
          manager,
          `
          UPDATE workout_sessions SET status='ABANDONED' WHERE scheduled_day_id=$1 AND status='IN_PROGRESS'
        `,
          [dayId],
        );
        await this.enrollment.scheduleNextMonth(manager, userId);
        return {
          id: null,
          scheduledDayId: dayId,
          status: 'EXEMPT',
          assessmentRunId: assessment.runId,
        };
      }
      if (![...decisions.values()].includes('NO_IDENTIFIED_CONFLICT')) {
        throw new ApiError(
          'WORKOUT_DAY_UNAVAILABLE',
          409,
          'No exercises are available for this workout.',
        );
      }
      const [other] = await query(
        manager,
        "SELECT id FROM workout_sessions WHERE user_id=$1 AND status='IN_PROGRESS' AND scheduled_day_id<>$2",
        [userId, dayId],
      );
      if (other)
        throw new ApiError(
          'WORKOUT_ALREADY_IN_PROGRESS',
          409,
          'Resume or pause the workout already in progress.',
        );
      const [session] = await query(
        manager,
        `INSERT INTO workout_sessions(id,user_id,scheduled_day_id) VALUES($1,$2,$3)
         ON CONFLICT (scheduled_day_id) DO UPDATE SET status='IN_PROGRESS'
         WHERE workout_sessions.status<>'COMPLETED' RETURNING id`,
        [randomUUID(), userId, dayId],
      );
      if (!session)
        throw new ApiError(
          'WORKOUT_COMPLETED',
          409,
          'This workout is already complete.',
        );
      return this.read(manager, userId, session.id);
    });
  }

  get(userId: string, sessionId: string) {
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.read(manager, userId, sessionId),
    );
  }

  current(userId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [active] = await query(
        manager,
        `SELECT s.id FROM workout_sessions s
         JOIN scheduled_days sd ON sd.id=s.scheduled_day_id
         JOIN program_enrollments e ON e.id=sd.enrollment_id
         WHERE s.user_id=$1 AND e.user_id=$1 AND e.ended_at IS NULL AND s.status='IN_PROGRESS'
         LIMIT 1`,
        [userId],
      );
      if (!active) return { session: null };
      return { session: await this.read(manager, userId, active.id) };
    });
  }

  private async read(
    manager: EntityManager,
    userId: string,
    sessionId: string,
  ) {
    const session = await this.session(manager, userId, sessionId);
    const exerciseRows = await query(
      manager,
      `SELECT we.id,er.content->>'title' AS title,we.set_count AS "setCount",we.position,
          (mc.workout_exercise_id IS NOT NULL) AS manual
       FROM workout_exercises we JOIN exercise_revisions er ON er.id=we.exercise_revision_id
       LEFT JOIN workout_manual_completions mc ON mc.workout_exercise_id=we.id AND mc.session_id=$2
       WHERE we.workout_revision_id=$1 ORDER BY we.position`,
      [session.workoutRevisionId, sessionId],
    );
    const logs = await query(
      manager,
      `SELECT workout_exercise_id AS "workoutExerciseId",set_number AS "setNumber",status,
          actual_reps AS "actualReps",weight_kg AS "weightKg",duration_seconds AS "durationSeconds"
       FROM workout_set_logs WHERE session_id=$1 ORDER BY set_number`,
      [sessionId],
    );
    const setsByExercise = new Map<string, Array<(typeof logs)[number]>>();
    for (const { workoutExerciseId, ...log } of logs) {
      const sets = setsByExercise.get(workoutExerciseId) ?? [];
      sets.push(log);
      setsByExercise.set(workoutExerciseId, sets);
    }
    const exercises = exerciseRows.map(({ manual, ...exercise }) => {
      const sets = setsByExercise.get(exercise.id) ?? [];
      return {
        ...exercise,
        completion: manual
          ? 'MANUAL'
          : sets.filter((set) => set.status === 'COMPLETED').length ===
              exercise.setCount
            ? 'SETS'
            : null,
        sets,
      };
    });
    const completedSets = logs.filter((set) => set.status === 'COMPLETED');
    return {
      id: session.id,
      scheduledDayId: session.scheduledDayId,
      status: session.status,
      date: session.date,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      exercises,
      summary: {
        recordedReps: completedSets.reduce(
          (total, set) => total + (set.actualReps ?? 0),
          0,
        ),
        completedSets: completedSets.length,
        completedExercises: exercises.filter(
          (exercise) => exercise.completion !== null,
        ).length,
        isPartial:
          completedSets.some((set) => set.actualReps === null) ||
          exercises.some((exercise) => exercise.completion === 'MANUAL'),
      },
    };
  }

  private async editableExercise(
    manager: EntityManager,
    userId: string,
    sessionId: string,
    exerciseId: string,
  ) {
    const session = await this.session(manager, userId, sessionId);
    this.assertEditable(session);
    const [exercise] = await query(
      manager,
      'SELECT set_count FROM workout_exercises WHERE id=$1 AND workout_revision_id=$2',
      [exerciseId, session.workoutRevisionId],
    );
    if (!exercise) throw new ApiError('NOT_FOUND', 404);
    const { decisions } = await this.ready(
      manager,
      userId,
      session.scheduledDayId,
    );
    if (decisions.get(exerciseId) !== 'NO_IDENTIFIED_CONFLICT') {
      throw new ApiError(
        'WORKOUT_EXERCISE_UNAVAILABLE',
        409,
        'This exercise cannot be logged for the current assessment.',
      );
    }
    return exercise;
  }

  private assertEditable(session: {
    status: string;
    enrollmentActive: boolean;
  }) {
    if (session.status !== 'IN_PROGRESS' || !session.enrollmentActive) {
      throw new ApiError(
        'WORKOUT_NOT_IN_PROGRESS',
        409,
        'Resume this workout before recording progress.',
      );
    }
  }

  saveSet(
    userId: string,
    sessionId: string,
    exerciseId: string,
    setNumber: number,
    input: WorkoutSetInput,
  ) {
    return this.withUser(userId, async (manager) => {
      const exercise = await this.editableExercise(
        manager,
        userId,
        sessionId,
        exerciseId,
      );
      if (setNumber > exercise.set_count) throw new ApiError('NOT_FOUND', 404);
      const values = input.status === 'COMPLETED' ? input : null;
      await query(
        manager,
        `INSERT INTO workout_set_logs(session_id,workout_exercise_id,set_number,status,actual_reps,weight_kg,duration_seconds)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (session_id,workout_exercise_id,set_number)
         DO UPDATE SET status=EXCLUDED.status,actual_reps=EXCLUDED.actual_reps,
           weight_kg=EXCLUDED.weight_kg,duration_seconds=EXCLUDED.duration_seconds`,
        [
          sessionId,
          exerciseId,
          setNumber,
          input.status,
          values?.actualReps ?? null,
          values?.weightKg ?? null,
          values?.durationSeconds ?? null,
        ],
      );
      return this.read(manager, userId, sessionId);
    });
  }

  saveExerciseCompletion(
    userId: string,
    sessionId: string,
    exerciseId: string,
    completed: boolean,
  ) {
    return this.withUser(userId, async (manager) => {
      await this.editableExercise(manager, userId, sessionId, exerciseId);
      await query(
        manager,
        completed
          ? 'INSERT INTO workout_manual_completions VALUES($1,$2) ON CONFLICT DO NOTHING'
          : 'DELETE FROM workout_manual_completions WHERE session_id=$1 AND workout_exercise_id=$2',
        [sessionId, exerciseId],
      );
      return this.read(manager, userId, sessionId);
    });
  }

  finish(userId: string, sessionId: string) {
    return this.withUser(userId, async (manager) => {
      const session = await this.session(manager, userId, sessionId);
      const result = await this.read(manager, userId, sessionId);
      if (session.status === 'COMPLETED') return result;
      this.assertEditable(session);
      const { assessment, decisions } = await this.ready(
        manager,
        userId,
        session.scheduledDayId,
      );
      const relevant = [];
      for (const exercise of result.exercises) {
        const decision = decisions.get(exercise.id);
        if (!decision || decision === 'NEEDS_REVIEW')
          throw new ApiError(
            'WORKOUT_ASSESSMENT_REQUIRED',
            409,
            'Resolve the pending exercise assessment before completing this workout.',
          );
        if (decision === 'NO_IDENTIFIED_CONFLICT') relevant.push(exercise);
      }
      if (
        !relevant.length ||
        relevant.some((exercise) => exercise.completion === null)
      ) {
        throw new ApiError(
          'WORKOUT_INCOMPLETE',
          409,
          'Complete all available exercises before finishing.',
        );
      }
      await query(
        manager,
        "UPDATE workout_sessions SET status='COMPLETED',completed_at=now() WHERE id=$1",
        [sessionId],
      );
      await query(
        manager,
        "UPDATE scheduled_days SET status='COMPLETED',resolved_at=now(),completion_fitting_run_id=$2 WHERE id=$1",
        [session.scheduledDayId, assessment.runId],
      );
      await this.enrollment.scheduleNextMonth(manager, userId);
      return this.read(manager, userId, sessionId);
    });
  }

  abandon(userId: string, sessionId: string) {
    return this.withUser(userId, async (manager) => {
      const session = await this.session(manager, userId, sessionId);
      if (session.status !== 'ABANDONED') {
        this.assertEditable(session);
        await query(
          manager,
          "UPDATE workout_sessions SET status='ABANDONED' WHERE id=$1",
          [sessionId],
        );
      }
      return this.read(manager, userId, sessionId);
    });
  }
}
