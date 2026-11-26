import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from '../../infrastructure/database/query';
import { ApiError } from '../../common/http';
import { ProgramEnrollmentService } from '../enrollments/program-enrollment.service';
import {
  PushNotificationPayload,
  PushNotificationService,
} from '../notifications/push-notification.service';
import { assertAgeEligible } from '../profiles/profile.policy';
import {
  Candidate,
  fingerprint,
  matchingProfile,
  MatchingProfile,
  MatchingResponseValidator,
  MetricsCalculator,
  policyVersion,
  PROGRAM_MATCHER,
  ProgramMatcher,
  publication,
  rulesetInput,
  schemaVersion,
} from './matching.contract';
import { ProgramEligibilityPolicy } from './program-eligibility.policy';
@Injectable()
export class ProgramMatchingService {
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Inject(PROGRAM_MATCHER) private matcher: ProgramMatcher,
    @Inject(ProgramEnrollmentService)
    private enrollment: ProgramEnrollmentService,
    @Optional()
    @Inject(PushNotificationService)
    private readonly push?: PushNotificationService,
  ) {}
  private eligibility = new ProgramEligibilityPolicy();
  private metrics = new MetricsCalculator();
  private validator = new MatchingResponseValidator();
  async createRuleset(input: z.infer<typeof rulesetInput>) {
    const [r] = await query(
      this.db,
      `INSERT INTO matching_rulesets(id,instruction_version,instructions,model,policy_version,schema_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        randomUUID(),
        input.instructionVersion,
        input.instructions,
        input.model,
        policyVersion,
        schemaVersion,
      ],
    );
    return r;
  }
  async listRulesets(limit: number, offset: number) {
    return {
      items: await query(
        this.db,
        'SELECT * FROM matching_rulesets ORDER BY created_at DESC,id LIMIT $1 OFFSET $2',
        [limit, offset],
      ),
      limit,
      offset,
    };
  }
  async publish(id: string, input: z.infer<typeof publication>) {
    return this.db.transaction(async (m) => {
      await query(m, 'SELECT pg_advisory_xact_lock(1793448017)');
      const [r] = await query(
        m,
        'SELECT * FROM matching_rulesets WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!r) throw new ApiError('NOT_FOUND', 404);
      if (r.status !== 'DRAFT')
        throw new ApiError('MATCHING_RULESET_IMMUTABLE', 409);
      await query(
        m,
        `UPDATE matching_rulesets SET active=false,status='ARCHIVED' WHERE active`,
      );
      return (
        await query(
          m,
          `UPDATE matching_rulesets SET active=true,status='PUBLISHED',published_at=now(),evaluation_reference=$2 WHERE id=$1 RETURNING *`,
          [id, input.evaluationReference],
        )
      )[0];
    });
  }
  private async userProfile(m: EntityManager, userId: string) {
    const [r] = await query(
      m,
      `SELECT p.*,u.status AS account_status FROM user_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1`,
      [userId],
    );
    if (!r || r.account_status !== 'ACTIVE')
      throw new ApiError('ACCOUNT_UNAVAILABLE', 403);
    if (!r.onboarded_at || !r.date_of_birth || !r.training_weekdays)
      return null;
    const birth =
      typeof r.date_of_birth === 'string'
        ? r.date_of_birth.slice(0, 10)
        : r.date_of_birth.toISOString().slice(0, 10);
    assertAgeEligible(birth, r.timezone);
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: r.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) => date.find((v) => v.type === type)!.value;
    const today = `${get('year')}-${get('month')}-${get('day')}`;
    let age = Number(get('year')) - Number(birth.slice(0, 4));
    if (today.slice(5) < birth.slice(5)) age--;
    const p = matchingProfile.safeParse({
      primaryGoal: r.primary_goal,
      fitnessLevel: r.fitness_level,
      trainingDaysPerWeek: r.training_weekdays.length,
      age,
      heightCm: Number(r.height_cm),
      weightKg: Number(r.weight_kg),
      targetWeightKg: Number(r.target_weight_kg),
      gender: r.gender,
    });
    return p.success ? p.data : null;
  }
  private publicRun(r: any, enrollmentId: string | null = null) {
    return {
      runId: r.id,
      status: r.status,
      selectedProgramVersionId: r.decision?.selectedProgramVersionId ?? null,
      reasonCodes: r.decision?.reasonCodes ?? [],
      failureCode: r.failure_code ?? null,
      assignmentStatus: enrollmentId ? 'ASSIGNED' : 'NOT_ASSIGNED',
      enrollmentId,
      createdAt: r.created_at,
    };
  }
  async status(userId: string, manager?: EntityManager) {
    const work = async (m: EntityManager) => {
      const [r] = await query(
        m,
        `SELECT * FROM recommendation_runs WHERE user_id=$1 AND kind='USER' ORDER BY created_at DESC,id DESC LIMIT 1`,
        [userId],
      );
      if (!r) return { status: 'NOT_STARTED', runId: null };
      const p = await this.userProfile(m, userId);
      const [active] = await query(
        m,
        'SELECT id FROM matching_rulesets WHERE active',
      );
      const c = p ? await this.eligibility.candidates(m, p) : [];
      return this.publicRun(
        p &&
          fingerprint(p) === r.input_hash &&
          active?.id === r.ruleset_id &&
          fingerprint(c) === fingerprint(r.candidates)
          ? r
          : {
              ...r,
              status: 'STALE',
              decision: null,
              failure_code: 'MATCHING_INPUT_CHANGED',
            },
        await this.enrollment.activeId(m, userId),
      );
    };
    return manager
      ? work(manager)
      : this.db.transaction('REPEATABLE READ', work);
  }
  async triggerUser(userId: string, retry = false, manager?: EntityManager) {
    let pendingNotification: PushNotificationPayload | null = null;
    const work = async (m: EntityManager) => {
      const [u] = await query(
        m,
        `SELECT id FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE`,
        [userId],
      );
      if (!u) throw new ApiError('ACCOUNT_UNAVAILABLE', 403);
      const p = await this.userProfile(m, userId);
      if (!p) return { status: 'INCOMPLETE_PROFILE', runId: null };
      const [ruleset] = await query(
        m,
        'SELECT * FROM matching_rulesets WHERE active',
      );
      if (!ruleset) return { status: 'CONFIGURATION_REQUIRED', runId: null };
      const hash = fingerprint(p);
      const c = await this.eligibility.candidates(m, p);
      const [previous] = await query(
        m,
        `SELECT * FROM recommendation_runs WHERE user_id=$1 AND kind='USER' ORDER BY created_at DESC,id DESC LIMIT 1`,
        [userId],
      );
      if (
        previous &&
        previous.input_hash === hash &&
        previous.ruleset_id === ruleset.id &&
        fingerprint(previous.candidates) === fingerprint(c) &&
        previous.status !== 'STALE' &&
        !(retry && previous.status === 'FAILED')
      ) {
        let enrollmentId = await this.enrollment.activeId(m, userId);
        // An explicit retry can apply a still-current recommendation recorded before enrollment existed.
        if (retry && !enrollmentId && previous.status === 'MATCH') {
          pendingNotification = await this.enrollment.assignFirst(
            m,
            userId,
            previous.id,
            previous.decision.selectedProgramVersionId,
          );
          enrollmentId = await this.enrollment.activeId(m, userId);
        }
        return this.publicRun(previous, enrollmentId);
      }
      if (c.length > 0 && c.length <= 200) {
        const [budget] = await query(
          m,
          `INSERT INTO rate_limits(key,bucket,count,expires_at) VALUES($1,$2,1,now()+interval '15 minutes') ON CONFLICT(key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`,
          [
            fingerprint(['matching-allocation', userId]),
            Math.floor(Date.now() / 900000),
          ],
        );
        if (budget.count > 10) return { status: 'RATE_LIMITED', runId: null };
      }
      const r = await this.insertRun(m, p, c, ruleset.id, 'USER', userId);
      return this.publicRun(r, await this.enrollment.activeId(m, userId));
    };
    const result = await (manager ? work(manager) : this.db.transaction(work));
    if (pendingNotification) {
      this.push?.dispatchAsync(userId, pendingNotification);
    }
    return result;
  }
  private async insertRun(
    m: EntityManager,
    p: MatchingProfile,
    c: Candidate[],
    rulesetId: string,
    kind: string,
    userId: string | null,
  ) {
    const status =
      c.length === 0 ? 'NO_MATCH' : c.length > 200 ? 'FAILED' : 'PENDING';
    const decision =
      status === 'NO_MATCH'
        ? {
            status: 'NO_MATCH',
            selectedProgramVersionId: null,
            reasonCodes: ['NO_SUITABLE_PROGRAM'],
          }
        : null;
    const [r] = await query(
      m,
      `INSERT INTO recommendation_runs(id,user_id,ruleset_id,kind,status,input_hash,profile_snapshot,candidates,decision,failure_code,metrics_snapshot,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $5='PENDING' THEN NULL ELSE now() END) RETURNING *`,
      [
        randomUUID(),
        userId,
        rulesetId,
        kind,
        status,
        fingerprint(p),
        p,
        JSON.stringify(c),
        decision,
        c.length > 200 ? 'MATCHING_CANDIDATE_LIMIT' : null,
        this.metrics.calculate(p),
      ],
    );
    return r;
  }
  async simulate(rulesetId: string, p: MatchingProfile) {
    return this.db.transaction(async (m) => {
      for (const [table, value] of [
        ['primary_goals', p.primaryGoal],
        ['fitness_levels', p.fitnessLevel],
        ['genders', p.gender],
      ]) {
        const [known] = await query(
          m,
          `SELECT code FROM ${table} WHERE code=$1 AND active`,
          [value],
        );
        if (!known)
          throw new ApiError(
            'MATCHING_LOOKUP_UNAVAILABLE',
            422,
            `Matching input value "${value}" is unavailable in ${table}.`,
          );
      }
      const [r] = await query(
        m,
        'SELECT id FROM matching_rulesets WHERE id=$1',
        [rulesetId],
      );
      if (!r) throw new ApiError('NOT_FOUND', 404);
      return this.publicRun(
        await this.insertRun(
          m,
          p,
          await this.eligibility.candidates(m, p),
          rulesetId,
          'SIMULATION',
          null,
        ),
      );
    });
  }
  async adminRun(id: string) {
    const [r] = await query(
      this.db,
      'SELECT * FROM recommendation_runs WHERE id=$1',
      [id],
    );
    if (!r) throw new ApiError('NOT_FOUND', 404);
    return r;
  }
  async processOne() {
    const token = randomUUID();
    const [run] = await query(
      this.db,
      `UPDATE recommendation_runs SET status='PROCESSING',attempts=attempts+1,lease_token=$1,lease_expires_at=now()+interval '45 seconds' WHERE id=(SELECT id FROM recommendation_runs WHERE (status='PENDING' OR (status='PROCESSING' AND lease_expires_at<now())) AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [token],
    );
    if (!run) return false;
    if (run.attempts > 2) {
      await query(
        this.db,
        `UPDATE recommendation_runs SET status='FAILED',failure_code='MATCHING_RETRY_LIMIT',lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1 AND lease_token=$2`,
        [run.id, token],
      );
      return true;
    }
    const started = Date.now();
    try {
      const [ruleset] = await query(
        this.db,
        'SELECT * FROM matching_rulesets WHERE id=$1',
        [run.ruleset_id],
      );
      const validBeforeCall = await this.db.transaction(async (m) => {
        if (run.user_id)
          await query(m, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [
            run.user_id,
          ]);
        const [owned] = await query(
          m,
          'SELECT id FROM recommendation_runs WHERE id=$1 AND lease_token=$2 FOR UPDATE',
          [run.id, token],
        );
        if (!owned) return false;
        const p = run.user_id
          ? await this.userProfile(m, run.user_id)
          : run.profile_snapshot;
        const [active] = await query(
          m,
          'SELECT id FROM matching_rulesets WHERE active',
        );
        const c = p ? await this.eligibility.candidates(m, p) : [];
        const valid =
          p &&
          fingerprint(p) === run.input_hash &&
          fingerprint(c) === fingerprint(run.candidates) &&
          (run.kind === 'SIMULATION' || active?.id === run.ruleset_id);
        if (!valid)
          await query(
            m,
            `UPDATE recommendation_runs SET status='STALE',failure_code='MATCHING_INPUT_CHANGED',completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2`,
            [run.id, token],
          );
        return !!valid;
      });
      if (!validBeforeCall) return true;
      const decision = this.validator.validate(
        await this.matcher.select({
          profile: run.profile_snapshot,
          metrics: this.metrics.calculate(run.profile_snapshot),
          candidates: run.candidates,
          instructions: ruleset.instructions,
          instructionVersion: ruleset.instruction_version,
          model: ruleset.model,
          policyVersion,
          schemaVersion,
        }),
        run.candidates,
      );
      let pendingNotification: PushNotificationPayload | null = null;
      await this.db.transaction(async (m) => {
        if (run.user_id)
          await query(m, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [
            run.user_id,
          ]);
        const [current] = await query(
          m,
          'SELECT * FROM recommendation_runs WHERE id=$1 AND lease_token=$2 FOR UPDATE',
          [run.id, token],
        );
        if (!current) return;
        const p = run.user_id
          ? await this.userProfile(m, run.user_id)
          : run.profile_snapshot;
        const [active] = await query(
          m,
          'SELECT id FROM matching_rulesets WHERE active',
        );
        const c = p ? await this.eligibility.candidates(m, p) : [];
        const stale =
          !p ||
          fingerprint(p) !== run.input_hash ||
          fingerprint(c) !== fingerprint(run.candidates) ||
          (run.kind === 'USER' && active?.id !== run.ruleset_id);
        await query(
          m,
          `UPDATE recommendation_runs SET status=$3,decision=$4,failure_code=$5,duration_ms=$6,completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2`,
          [
            run.id,
            token,
            stale ? 'STALE' : decision.status,
            stale ? null : decision,
            stale ? 'MATCHING_INPUT_CHANGED' : null,
            Date.now() - started,
          ],
        );
        if (
          !stale &&
          run.kind === 'USER' &&
          decision.status === 'MATCH' &&
          decision.selectedProgramVersionId
        )
          pendingNotification = await this.enrollment.assignFirst(
            m,
            run.user_id,
            run.id,
            decision.selectedProgramVersionId,
          );
      });
      if (pendingNotification && run.user_id) {
        this.push?.dispatchAsync(run.user_id, pendingNotification);
      }
    } catch (error) {
      const code =
        error instanceof ApiError ? error.code : 'AI_MATCHING_UNAVAILABLE';
      const retry = run.attempts < 2 && code === 'AI_MATCHING_UNAVAILABLE';
      await query(
        this.db,
        `UPDATE recommendation_runs SET status=$3,failure_code=$4,duration_ms=$5,completed_at=CASE WHEN $3='FAILED' THEN now() ELSE NULL END,available_at=now()+interval '10 seconds',lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2`,
        [
          run.id,
          token,
          retry ? 'PENDING' : 'FAILED',
          code,
          Date.now() - started,
        ],
      );
    }
    return true;
  }
}
