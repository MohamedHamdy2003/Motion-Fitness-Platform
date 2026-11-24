import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { environment } from '../../config/environment';
import { query } from '../../infrastructure/database/query';
import { AdminEventsService } from '../../infrastructure/realtime/admin-events.service';

const processStartedAt = new Date().toISOString();

@Injectable()
export class AnalyticsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private lastAiModel: string | null = null;
  private lastAiUptimeSeconds: number | null = null;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Optional()
    @Inject(AdminEventsService)
    private readonly events?: AdminEventsService,
  ) {}

  onApplicationBootstrap() {
    if (environment().NODE_ENV !== 'test') {
      void this.runAndRecordUptimeCheck().catch(() => undefined);
      this.timer = setInterval(() => {
        void this.runAndRecordUptimeCheck().catch(() => undefined);
      }, 60_000).unref();
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private resolveAiHealthUrl(): string | null {
    const e = environment();
    if (!e.AI_SERVICE_TOKEN || e.AI_RETENTION_APPROVED !== 'true') {
      return null;
    }
    const candidate = e.AI_MATCHING_URL || e.AI_FITTING_URL || e.AI_REWRITE_URL;
    if (!candidate || !URL.canParse(candidate)) return null;
    const url = new URL(candidate);
    return `${url.origin}/health`;
  }

  async probeLiveHealth() {
    const dbStart = Date.now();
    let databaseOk = false;
    let databaseLatencyMs = 0;
    try {
      await query(this.db, 'SELECT 1');
      databaseOk = true;
      databaseLatencyMs = Date.now() - dbStart;
    } catch {
      databaseOk = false;
      databaseLatencyMs = Date.now() - dbStart;
    }

    const aiHealthUrl = this.resolveAiHealthUrl();
    let aiServiceStatus: 'UP' | 'DOWN' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';
    let aiServiceLatencyMs: number | null = null;
    let aiModel: string | null = null;
    let aiUptimeSeconds: number | null = null;

    if (aiHealthUrl) {
      const aiStart = Date.now();
      try {
        const res = await fetch(aiHealthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(4000),
        });
        aiServiceLatencyMs = Date.now() - aiStart;
        if (res.ok) {
          aiServiceStatus = 'UP';
          const body = (await res.json().catch(() => null)) as {
            model?: string;
            uptimeSeconds?: number;
          } | null;
          aiModel = body?.model ?? null;
          aiUptimeSeconds =
            typeof body?.uptimeSeconds === 'number' ? body.uptimeSeconds : null;
          if (aiModel) this.lastAiModel = aiModel;
          if (aiUptimeSeconds !== null) {
            this.lastAiUptimeSeconds = aiUptimeSeconds;
          }
        } else {
          aiServiceStatus = 'DOWN';
        }
      } catch {
        aiServiceLatencyMs = Date.now() - aiStart;
        aiServiceStatus = 'DOWN';
      }
    }

    return {
      database: {
        ok: databaseOk,
        latencyMs: databaseLatencyMs,
      },
      aiService: {
        status: aiServiceStatus,
        latencyMs: aiServiceLatencyMs,
        model: aiModel,
        uptimeSeconds: aiUptimeSeconds,
      },
      apiUptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }

  async runAndRecordUptimeCheck() {
    const live = await this.probeLiveHealth();
    const id = randomUUID();
    await query(
      this.db,
      `INSERT INTO uptime_checks(
         id, database_ok, database_latency_ms,
         ai_service_status, ai_service_latency_ms, api_uptime_seconds
       )
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        id,
        live.database.ok,
        live.database.latencyMs,
        live.aiService.status,
        live.aiService.latencyMs,
        live.apiUptimeSeconds,
      ],
    );
    this.events?.emit('analytics');
    return { id, ...live };
  }

  async overview(days: number, live = false) {
    const e = environment();
    const [
      platformRows,
      summaryRows,
      byOperationRows,
      dailySeriesRows,
      recentCallsRows,
      availabilityRows,
      recentChecksRows,
    ] = await Promise.all([
      query(
        this.db,
        `SELECT
           (SELECT count(*)::integer FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code='ADMIN')) AS "totalUsers",
           (SELECT count(*)::integer FROM users u WHERE u.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code='ADMIN')) AS "activeUsers",
           (SELECT count(*)::integer FROM user_profiles WHERE onboarded_at IS NOT NULL) AS "onboardedUsers",
           (SELECT count(*)::integer FROM program_enrollments WHERE ended_at IS NULL) AS "activeEnrollments",
           (SELECT count(DISTINCT program_id)::integer FROM program_versions WHERE status='PUBLISHED') AS "publishedPrograms",
           (SELECT count(*)::integer FROM workout_sessions WHERE status='COMPLETED' AND completed_at >= now() - ($1 * interval '1 day')) AS "completedWorkouts",
           (SELECT count(*)::integer FROM scheduled_meals WHERE status='COMPLETED' AND completed_at >= now() - ($1 * interval '1 day')) AS "completedMeals",
           (SELECT count(*)::integer FROM user_check_ins WHERE created_at >= now() - ($1 * interval '1 day')) AS "checkIns"`,
        [days],
      ),
      query(
        this.db,
        `SELECT
           count(*)::integer AS "totalRequests",
           count(*) FILTER (WHERE status='SUCCEEDED')::integer AS "succeededRequests",
           count(*) FILTER (WHERE status='FAILED')::integer AS "failedRequests",
           count(*) FILTER (WHERE status='FAILED' AND created_at >= now() - interval '24 hours')::integer AS "failedLast24h",
           coalesce(sum(input_tokens), 0)::bigint::text AS "totalInputTokens",
           coalesce(sum(output_tokens), 0)::bigint::text AS "totalOutputTokens",
           coalesce(sum(total_tokens), 0)::bigint::text AS "totalTokens",
           coalesce(sum(estimated_cost_usd), 0)::numeric(12,6)::text AS "estimatedCostUsd",
           coalesce(round(avg(latency_ms)), 0)::integer AS "avgLatencyMs"
         FROM ai_usage_logs
         WHERE created_at >= now() - ($1 * interval '1 day')`,
        [days],
      ),
      query(
        this.db,
        `SELECT
           operation,
           count(*)::integer AS requests,
           count(*) FILTER (WHERE status='SUCCEEDED')::integer AS succeeded,
           count(*) FILTER (WHERE status='FAILED')::integer AS failed,
           coalesce(sum(input_tokens), 0)::bigint::text AS "inputTokens",
           coalesce(sum(output_tokens), 0)::bigint::text AS "outputTokens",
           coalesce(sum(total_tokens), 0)::bigint::text AS "totalTokens",
           coalesce(sum(estimated_cost_usd), 0)::numeric(12,6)::text AS "estimatedCostUsd",
           coalesce(round(avg(latency_ms)), 0)::integer AS "avgLatencyMs"
         FROM ai_usage_logs
         WHERE created_at >= now() - ($1 * interval '1 day')
         GROUP BY operation
         ORDER BY requests DESC, operation ASC`,
        [days],
      ),
      query(
        this.db,
        `SELECT
           to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
           count(*)::integer AS requests,
           count(*) FILTER (WHERE status='FAILED')::integer AS failed,
           coalesce(sum(input_tokens), 0)::bigint::text AS "inputTokens",
           coalesce(sum(output_tokens), 0)::bigint::text AS "outputTokens",
           coalesce(sum(total_tokens), 0)::bigint::text AS "totalTokens",
           coalesce(sum(estimated_cost_usd), 0)::numeric(12,6)::text AS "estimatedCostUsd"
         FROM ai_usage_logs
         WHERE created_at >= now() - ($1 * interval '1 day')
         GROUP BY 1
         ORDER BY 1 ASC`,
        [days],
      ),
      query(
        this.db,
        `SELECT
           id, operation, model, status,
           input_tokens AS "inputTokens",
           output_tokens AS "outputTokens",
           total_tokens AS "totalTokens",
           estimated_cost_usd::text AS "estimatedCostUsd",
           latency_ms AS "latencyMs",
           failure_code AS "failureCode",
           created_at AS "createdAt"
         FROM ai_usage_logs
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
      ),
      query(
        this.db,
        `SELECT
           count(*)::integer AS "totalChecks",
           count(*) FILTER (WHERE database_ok)::integer AS "databaseUpChecks",
           count(*) FILTER (WHERE ai_service_status='UP')::integer AS "aiUpChecks",
           count(*) FILTER (WHERE ai_service_status IN ('UP','DOWN'))::integer AS "aiConfiguredChecks",
           coalesce(round(avg(database_latency_ms)), 0)::integer AS "avgDatabaseLatencyMs",
           coalesce(round(avg(ai_service_latency_ms) FILTER (WHERE ai_service_latency_ms IS NOT NULL)), 0)::integer AS "avgAiLatencyMs"
         FROM uptime_checks
         WHERE checked_at >= now() - interval '24 hours'`,
      ),
      query(
        this.db,
        `SELECT
           id, database_ok AS "databaseOk",
           database_latency_ms AS "databaseLatencyMs",
           ai_service_status AS "aiServiceStatus",
           ai_service_latency_ms AS "aiServiceLatencyMs",
           api_uptime_seconds AS "apiUptimeSeconds",
           checked_at AS "checkedAt"
         FROM uptime_checks
         ORDER BY checked_at DESC
         LIMIT 24`,
      ),
    ]);

    const latestCheck = recentChecksRows[0] as
      | {
          databaseOk: boolean;
          databaseLatencyMs: number;
          aiServiceStatus: 'UP' | 'DOWN' | 'NOT_CONFIGURED';
          aiServiceLatencyMs: number | null;
          apiUptimeSeconds: number;
          checkedAt: string;
        }
      | undefined;
    const liveStatus =
      live || !latestCheck
        ? await this.probeLiveHealth()
        : {
            database: {
              ok: Boolean(latestCheck.databaseOk),
              latencyMs: latestCheck.databaseLatencyMs ?? 0,
            },
            aiService: {
              status: latestCheck.aiServiceStatus,
              latencyMs: latestCheck.aiServiceLatencyMs ?? null,
              model:
                this.lastAiModel ??
                (recentCallsRows[0]?.model as string | undefined) ??
                null,
              uptimeSeconds: this.lastAiUptimeSeconds,
            },
            apiUptimeSeconds: Math.floor(process.uptime()),
            checkedAt: latestCheck.checkedAt,
          };

    const rawSummary = summaryRows[0];
    const totalRequests = rawSummary?.totalRequests ?? 0;
    const succeededRequests = rawSummary?.succeededRequests ?? 0;
    const successRate =
      totalRequests > 0
        ? Number(((succeededRequests / totalRequests) * 100).toFixed(2))
        : 100;

    const avail = availabilityRows[0];
    const totalChecks = avail?.totalChecks ?? 0;
    const databaseUptimePct =
      totalChecks > 0
        ? Number(((avail.databaseUpChecks / totalChecks) * 100).toFixed(2))
        : liveStatus.database.ok
          ? 100
          : 0;
    const aiServiceUptimePct =
      avail?.aiConfiguredChecks > 0
        ? Number(
            ((avail.aiUpChecks / avail.aiConfiguredChecks) * 100).toFixed(2),
          )
        : liveStatus.aiService.status === 'UP'
          ? 100
          : null;

    const integrations = {
      database: liveStatus.database.ok ? 'CONNECTED' : 'ERROR',
      geminiAi:
        e.AI_RETENTION_APPROVED === 'true' &&
        Boolean(e.AI_SERVICE_TOKEN) &&
        Boolean(e.AI_MATCHING_URL || e.AI_FITTING_URL || e.AI_REWRITE_URL)
          ? liveStatus.aiService.status
          : 'NOT_CONFIGURED',
      email: ['resend', 'smtp'].includes(e.MAIL_MODE)
        ? `CONFIGURED (${e.MAIL_MODE.toUpperCase()})`
        : e.MAIL_MODE === 'capture'
          ? 'LOCAL_CAPTURE'
          : 'NOT_CONFIGURED',
      s3Storage:
        Boolean(e.S3_BUCKET) &&
        (e.S3_AUTH_MODE === 'iam' ||
          (Boolean(e.S3_ACCESS_KEY_ID) && Boolean(e.S3_SECRET_ACCESS_KEY)))
          ? `CONFIGURED (${e.S3_AUTH_MODE.toUpperCase()})`
          : 'NOT_CONFIGURED',
      googleOAuth: e.GOOGLE_CLIENT_IDS ? 'CONFIGURED' : 'NOT_CONFIGURED',
      appleOAuth:
        e.APPLE_CLIENT_IDS &&
        e.APPLE_TEAM_ID &&
        e.APPLE_KEY_ID &&
        e.APPLE_PRIVATE_KEY
          ? 'CONFIGURED'
          : 'NOT_CONFIGURED',
      accountDeletionRetention:
        e.DELETION_RETENTION_APPROVED === 'true' ? 'APPROVED' : 'NOT_APPROVED',
    };

    return {
      periodDays: days,
      platform: platformRows[0],
      geminiUsage: {
        summary: {
          totalRequests,
          succeededRequests,
          failedRequests: rawSummary?.failedRequests ?? 0,
          failedLast24h: rawSummary?.failedLast24h ?? 0,
          latestCallFailed: recentCallsRows[0]?.status === 'FAILED',
          successRate,
          totalInputTokens: Number(rawSummary?.totalInputTokens ?? 0),
          totalOutputTokens: Number(rawSummary?.totalOutputTokens ?? 0),
          totalTokens: Number(rawSummary?.totalTokens ?? 0),
          estimatedCostUsd: Number(rawSummary?.estimatedCostUsd ?? 0),
          avgLatencyMs: rawSummary?.avgLatencyMs ?? 0,
        },
        byOperation: byOperationRows.map(
          (row: {
            operation: string;
            requests: number;
            succeeded: number;
            failed: number;
            inputTokens: string;
            outputTokens: string;
            totalTokens: string;
            estimatedCostUsd: string;
            avgLatencyMs: number;
          }) => ({
            ...row,
            inputTokens: Number(row.inputTokens),
            outputTokens: Number(row.outputTokens),
            totalTokens: Number(row.totalTokens),
            estimatedCostUsd: Number(row.estimatedCostUsd),
          }),
        ),
        dailySeries: dailySeriesRows.map(
          (row: {
            date: string;
            requests: number;
            failed: number;
            inputTokens: string;
            outputTokens: string;
            totalTokens: string;
            estimatedCostUsd: string;
          }) => ({
            ...row,
            inputTokens: Number(row.inputTokens),
            outputTokens: Number(row.outputTokens),
            totalTokens: Number(row.totalTokens),
            estimatedCostUsd: Number(row.estimatedCostUsd),
          }),
        ),
        recentCalls: recentCallsRows.map(
          (row: { estimatedCostUsd: string }) => ({
            ...row,
            estimatedCostUsd: Number(row.estimatedCostUsd),
          }),
        ),
      },
      uptime: {
        apiUptimeSeconds: Math.floor(process.uptime()),
        startedAt: processStartedAt,
        memoryRssMb: Number(
          (process.memoryUsage().rss / (1024 * 1024)).toFixed(1),
        ),
        nodeVersion: process.version,
        liveStatus,
        availability24h: {
          totalChecks,
          databaseUptimePct,
          aiServiceUptimePct,
          avgDatabaseLatencyMs: avail?.avgDatabaseLatencyMs ?? 0,
          avgAiLatencyMs: avail?.avgAiLatencyMs ?? 0,
        },
        recentChecks: recentChecksRows,
        integrations,
      },
    };
  }
}
