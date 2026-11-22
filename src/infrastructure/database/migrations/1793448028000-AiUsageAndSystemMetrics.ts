import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiUsageAndSystemMetrics1793448028000 implements MigrationInterface {
  name = 'AiUsageAndSystemMetrics1793448028000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE ai_usage_logs (
        id uuid PRIMARY KEY,
        operation text NOT NULL CHECK (operation IN ('PROGRAM_MATCHING','EXERCISE_FITTING','INJURY_REWRITE','PROGRAM_HINTS_REWRITE')),
        model text NOT NULL,
        status text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
        input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
        estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
        latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
        failure_code text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ai_usage_logs_created_op_idx ON ai_usage_logs(created_at DESC, operation);

      CREATE TABLE uptime_checks (
        id uuid PRIMARY KEY,
        database_ok boolean NOT NULL,
        database_latency_ms integer NOT NULL DEFAULT 0 CHECK (database_latency_ms >= 0),
        ai_service_status text NOT NULL CHECK (ai_service_status IN ('UP','DOWN','NOT_CONFIGURED')),
        ai_service_latency_ms integer CHECK (ai_service_latency_ms IS NULL OR ai_service_latency_ms >= 0),
        api_uptime_seconds integer NOT NULL DEFAULT 0 CHECK (api_uptime_seconds >= 0),
        checked_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX uptime_checks_checked_at_idx ON uptime_checks(checked_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS uptime_checks_checked_at_idx;
      DROP TABLE IF EXISTS uptime_checks;
      DROP INDEX IF EXISTS ai_usage_logs_created_op_idx;
      DROP TABLE IF EXISTS ai_usage_logs;
    `);
  }
}
