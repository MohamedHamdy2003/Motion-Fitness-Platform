import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyActivity1793448021000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_settings
        ADD COLUMN water_goal_ml integer NOT NULL DEFAULT 2500 CHECK (water_goal_ml BETWEEN 250 AND 10000),
        ADD COLUMN steps_goal integer NOT NULL DEFAULT 10000 CHECK (steps_goal BETWEEN 100 AND 100000);

      CREATE TABLE water_logs (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date date NOT NULL,
        milliliters integer NOT NULL CHECK (milliliters BETWEEN 1 AND 2000),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX water_logs_user_date ON water_logs(user_id,local_date,created_at DESC,id DESC);

      CREATE TABLE daily_steps (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date date NOT NULL,
        steps integer NOT NULL DEFAULT 0 CHECK (steps BETWEEN 0 AND 200000),
        manually_completed boolean NOT NULL DEFAULT false,
        PRIMARY KEY (user_id,local_date)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE daily_steps, water_logs;
      ALTER TABLE user_settings DROP COLUMN steps_goal, DROP COLUMN water_goal_ml;
    `);
  }
}
