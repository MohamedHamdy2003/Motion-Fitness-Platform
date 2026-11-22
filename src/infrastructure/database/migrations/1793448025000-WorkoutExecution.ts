import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkoutExecution1793448025000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE scheduled_days
        ADD COLUMN exemption_fitting_run_id uuid REFERENCES daily_fitting_runs(id),
        ADD COLUMN completion_fitting_run_id uuid REFERENCES daily_fitting_runs(id);
      CREATE TABLE workout_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scheduled_day_id uuid NOT NULL UNIQUE REFERENCES scheduled_days(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','ABANDONED','COMPLETED')),
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        CHECK ((status='COMPLETED')=(completed_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX workout_sessions_one_active ON workout_sessions(user_id) WHERE status='IN_PROGRESS';
      CREATE TABLE workout_set_logs (
        session_id uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id),
        set_number integer NOT NULL CHECK (set_number>0),
        status text NOT NULL CHECK (status IN ('COMPLETED','SKIPPED')),
        actual_reps integer CHECK (actual_reps BETWEEN 0 AND 500),
        weight_kg numeric CHECK (weight_kg BETWEEN 0 AND 1000),
        duration_seconds integer CHECK (duration_seconds BETWEEN 1 AND 86400),
        CHECK (status='COMPLETED' OR (actual_reps IS NULL AND weight_kg IS NULL AND duration_seconds IS NULL)),
        PRIMARY KEY (session_id,workout_exercise_id,set_number)
      );
      CREATE TABLE workout_manual_completions (
        session_id uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id),
        PRIMARY KEY (session_id,workout_exercise_id)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE scheduled_days DROP COLUMN exemption_fitting_run_id, DROP COLUMN completion_fitting_run_id;
      DROP TABLE workout_manual_completions,workout_set_logs,workout_sessions;
    `);
  }
}
