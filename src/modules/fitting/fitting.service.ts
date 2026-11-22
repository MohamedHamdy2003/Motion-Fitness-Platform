import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { fingerprint } from '../matching/matching.contract';
import { AiProgramFitter } from './ai-program-fitter';
import {
  ExerciseDecision,
  ExerciseFittingResult,
  fittingInput,
  fittingPolicyVersion,
} from './fitting.contract';

type DaySnapshot = {
  due: boolean;
  kind: 'TRAINING' | 'REST';
  state: string;
  injuryRevision: number;
  exemptionRunId: string | null;
  completionRunId: string | null;
  injuries: unknown[];
  exercises: { workoutExerciseId: string }[];
};

type Run = {
  id: string;
  user_id: string;
  scheduled_day_id: string;
  injury_revision: number;
  content_hash: string;
  policy_version: string;
  status: ExerciseFittingResult['status'];
  decisions: ExerciseDecision[];
  failure_code: string | null;
  attempts: number;
};

@Injectable()
export class ExerciseFittingService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AiProgramFitter) private readonly fitter: AiProgramFitter,
  ) {}

  async evaluate(
    userId: string,
    dayId: string,
    retry = false,
  ): Promise<ExerciseFittingResult> {
    return this.db.transaction(async (m) => {
      await query(m, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      return this.read(userId, dayId, m, true, retry);
    });
  }

  // Workout writes call this after locking the user's row, also used by injury changes.
  current(
    userId: string,
    dayId: string,
    m: EntityManager,
  ): Promise<ExerciseFittingResult> {
    return this.read(userId, dayId, m, false, false);
  }

  private async snapshot(
    m: EntityManager,
    userId: string,
    dayId: string,
  ): Promise<DaySnapshot | undefined> {
    const [day] = await query(
      m,
      `
      SELECT sd.local_date <= (now() AT TIME ZONE en.timezone)::date AS due,
        sd.status AS state,
        sd.exemption_fitting_run_id AS "exemptionRunId",
        sd.completion_fitting_run_id AS "completionRunId",
        pd.kind, rs.injury_revision AS "injuryRevision",
        COALESCE((SELECT jsonb_agg(to_jsonb(confirmed) - 'id' ORDER BY confirmed.id) FROM (
          SELECT id, body_area_code AS "bodyAreaCode", side, description
          FROM user_injuries WHERE user_id=$1 AND status='ACTIVE' ORDER BY id LIMIT 51
        ) confirmed), '[]'::jsonb) AS injuries,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'workoutExerciseId', we.id,
          'title', er.content->'title', 'description', er.content->'description',
          'instructions', er.content->'instructions', 'muscleGroups', er.content->'muscleGroups',
          'equipment', er.content->'equipment'
        ) ORDER BY we.position,we.id)
        FROM workout_exercises we JOIN exercise_revisions er ON er.id=we.exercise_revision_id
        WHERE we.workout_revision_id=pd.workout_revision_id AND er.status='PUBLISHED'), '[]'::jsonb) AS exercises
      FROM scheduled_days sd
      JOIN program_enrollments en ON en.id=sd.enrollment_id AND en.user_id=$1 AND en.ended_at IS NULL
      JOIN users u ON u.id=en.user_id AND u.status='ACTIVE' AND u.verified_at IS NOT NULL
      JOIN user_restriction_states rs ON rs.user_id=u.id
      JOIN plan_days pd ON pd.id=sd.plan_day_id
      WHERE sd.id=$2`,
      [userId, dayId],
    );
    return day;
  }

  private input(day: DaySnapshot) {
    return fittingInput.safeParse({
      policyVersion: fittingPolicyVersion,
      injuries: day.injuries,
      exercises: day.exercises,
    });
  }

  private result(run: Run): ExerciseFittingResult {
    return {
      status: run.status,
      runId: run.id,
      decisions: run.decisions,
      failureCode: run.status === 'FAILED' ? run.failure_code : null,
    };
  }

  private unrestrictedResult(
    exercises: { workoutExerciseId: string }[],
  ): ExerciseFittingResult {
    return {
      status: 'NOT_REQUIRED',
      runId: null,
      failureCode: null,
      decisions: exercises.map(({ workoutExerciseId }) => ({
        workoutExerciseId,
        status: 'NO_IDENTIFIED_CONFLICT',
      })),
    };
  }

  private async read(
    userId: string,
    dayId: string,
    m: EntityManager,
    enqueue: boolean,
    retry = false,
  ): Promise<ExerciseFittingResult> {
    const day = await this.snapshot(m, userId, dayId);
    if (!day) throw new ApiError('NOT_FOUND', 404);
    if (!day.due) throw new ApiError('WORKOUT_DAY_NOT_DUE', 409);

    if (day.state === 'COMPLETED') {
      const [retained] = day.completionRunId
        ? await query(
            m,
            `SELECT * FROM daily_fitting_runs WHERE id=$1 AND scheduled_day_id=$2`,
            [day.completionRunId, dayId],
          )
        : await query(
            m,
            `SELECT * FROM daily_fitting_runs WHERE scheduled_day_id=$1 AND status IN ('READY','NEEDS_REVIEW') ORDER BY completed_at DESC,id DESC LIMIT 1`,
            [dayId],
          );
      if (retained) return this.result(retained);
      return this.unrestrictedResult(day.exercises);
    }

    if (day.state === 'EXEMPT' && day.exemptionRunId) {
      const [retained] = await query(
        m,
        `SELECT * FROM daily_fitting_runs WHERE id=$1 AND scheduled_day_id=$2`,
        [day.exemptionRunId, dayId],
      );
      if (retained) return this.result(retained);
    }

    if (day.kind === 'REST' || day.injuries.length === 0) {
      return this.unrestrictedResult(day.exercises);
    }

    const parsed = this.input(day);
    if (!parsed.success)
      return {
        status: 'FAILED',
        runId: null,
        decisions: [],
        failureCode: 'FITTING_INPUT_UNAVAILABLE',
      };
    const key = [
      dayId,
      day.injuryRevision,
      fingerprint(parsed.data.exercises),
      fittingPolicyVersion,
    ];
    const [existing] = await query(
      m,
      `SELECT * FROM daily_fitting_runs WHERE scheduled_day_id=$1 AND injury_revision=$2 AND content_hash=$3 AND policy_version=$4 AND status<>'SUPERSEDED'`,
      key,
    );
    if (existing && !(retry && existing.status === 'FAILED')) {
      return this.result(existing);
    }
    if (!this.fitter.available())
      return {
        status: 'FAILED',
        runId: null,
        decisions: [],
        failureCode: 'AI_FITTING_NOT_CONFIGURED',
      };
    if (!enqueue)
      return {
        status: 'PENDING',
        runId: null,
        decisions: [],
        failureCode: null,
      };

    // All callers allocating runs serialize on the same user row.
    const [queued] = await query(
      m,
      `INSERT INTO daily_fitting_runs(id,scheduled_day_id,injury_revision,content_hash,policy_version,status)
      VALUES($5,$1,$2,$3,$4,'PENDING')
      ON CONFLICT (scheduled_day_id,injury_revision,content_hash,policy_version) DO UPDATE
        SET status='PENDING',attempts=0,failure_code=NULL,available_at=now(),completed_at=NULL
        WHERE daily_fitting_runs.status IN ('SUPERSEDED','FAILED')
      RETURNING *`,
      [...key, randomUUID()],
    );
    return this.result(queued ?? existing);
  }

  private matches(run: Run, day: DaySnapshot | undefined) {
    if (
      !day ||
      !day.due ||
      day.state === 'COMPLETED' ||
      day.kind !== 'TRAINING'
    )
      return null;
    const parsed = this.input(day);
    if (
      !parsed.success ||
      day.injuryRevision !== run.injury_revision ||
      run.policy_version !== fittingPolicyVersion ||
      fingerprint(parsed.data.exercises) !== run.content_hash
    )
      return null;
    return parsed.data;
  }

  async processOne() {
    const token = randomUUID();
    const [run] = (await query(
      this.db,
      `UPDATE daily_fitting_runs SET
        status='RUNNING', attempts=attempts+1, lease_token=$1, lease_expires_at=now()+interval '45 seconds'
      WHERE id=(SELECT id FROM daily_fitting_runs
        WHERE available_at<=now() AND (status='PENDING' OR (status='RUNNING' AND lease_expires_at<=now()))
        ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *, (SELECT en.user_id FROM scheduled_days sd JOIN program_enrollments en ON en.id=sd.enrollment_id
        WHERE sd.id=daily_fitting_runs.scheduled_day_id) AS user_id`,
      [token],
    )) as Run[];
    if (!run) return false;

    if (run.attempts > 2) {
      await this.finish(
        this.db.manager,
        run,
        token,
        'FAILED',
        [],
        null,
        'FITTING_ATTEMPT_LIMIT',
      );
      return true;
    }

    const input = this.matches(
      run,
      await this.snapshot(this.db.manager, run.user_id, run.scheduled_day_id),
    );
    if (!input) {
      await this.finish(
        this.db.manager,
        run,
        token,
        'SUPERSEDED',
        [],
        null,
        null,
      );
      return true;
    }
    let output;
    try {
      output = await this.fitter.assess(input);
    } catch (error) {
      const code =
        error instanceof ApiError ? error.code : 'AI_FITTING_UNAVAILABLE';
      if (run.attempts < 2 && code === 'AI_FITTING_UNAVAILABLE') {
        await query(
          this.db,
          `UPDATE daily_fitting_runs SET status='PENDING',lease_token=NULL,lease_expires_at=NULL,
          available_at=now()+interval '10 seconds' WHERE id=$1 AND lease_token=$2`,
          [run.id, token],
        );
      } else {
        await this.finish(
          this.db.manager,
          run,
          token,
          'FAILED',
          [],
          null,
          code,
        );
      }
      return true;
    }

    await this.db.transaction(async (m) => {
      await query(m, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        run.user_id,
      ]);
      const current = this.matches(
        run,
        await this.snapshot(m, run.user_id, run.scheduled_day_id),
      );
      if (!current) {
        await this.finish(m, run, token, 'SUPERSEDED', [], null, null);
        return;
      }
      const status = output.decisions.some(
        (item) => item.status === 'NEEDS_REVIEW',
      )
        ? 'NEEDS_REVIEW'
        : 'READY';
      await this.finish(
        m,
        run,
        token,
        status,
        output.decisions,
        output.modelVersion,
        null,
      );
    });
    return true;
  }

  private async finish(
    m: EntityManager,
    run: Run,
    token: string,
    status: 'FAILED' | 'SUPERSEDED' | 'NEEDS_REVIEW' | 'READY',
    decisions: ExerciseDecision[],
    model: string | null,
    failure: string | null,
  ) {
    await query(
      m,
      `UPDATE daily_fitting_runs SET status=$3,decisions=$4,model_version=$5,failure_code=$6,
      lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2 AND lease_expires_at>now()`,
      [run.id, token, status, JSON.stringify(decisions), model, failure],
    );
  }
}
