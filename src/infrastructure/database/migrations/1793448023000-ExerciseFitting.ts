import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExerciseFitting1793448023000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE daily_fitting_runs (
        id uuid PRIMARY KEY,
        scheduled_day_id uuid NOT NULL REFERENCES scheduled_days(id) ON DELETE CASCADE,
        injury_revision integer NOT NULL,
        content_hash text NOT NULL,
        policy_version text NOT NULL,
        status text NOT NULL CHECK(status IN ('PENDING','RUNNING','READY','NEEDS_REVIEW','FAILED','SUPERSEDED')),
        decisions jsonb NOT NULL DEFAULT '[]',
        attempts smallint NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        lease_token uuid,
        lease_expires_at timestamptz,
        model_version text,
        failure_code text,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (scheduled_day_id,injury_revision,content_hash,policy_version),
        CHECK (jsonb_typeof(decisions)='array'),
        CHECK ((status='RUNNING') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
      );
      CREATE INDEX daily_fitting_work_queue ON daily_fitting_runs (available_at,id)
        WHERE status IN ('PENDING','RUNNING');
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE daily_fitting_runs');
  }
}
