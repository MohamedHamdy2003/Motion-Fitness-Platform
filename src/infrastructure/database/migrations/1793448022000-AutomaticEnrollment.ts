import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomaticEnrollment1793448022000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE program_enrollments (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
        recommendation_run_id uuid NOT NULL UNIQUE REFERENCES recommendation_runs DEFERRABLE INITIALLY DEFERRED,
        program_version_id uuid NOT NULL REFERENCES program_versions,
        starts_on date NOT NULL,
        timezone text NOT NULL,
        training_weekdays text[] NOT NULL CHECK (valid_training_weekdays(training_weekdays)),
        created_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz
      );
      CREATE UNIQUE INDEX one_active_enrollment ON program_enrollments(user_id) WHERE ended_at IS NULL;
      CREATE INDEX program_enrollments_user_history ON program_enrollments(user_id, starts_on DESC);

      CREATE TABLE scheduled_days (
        id uuid PRIMARY KEY,
        enrollment_id uuid NOT NULL REFERENCES program_enrollments ON DELETE CASCADE,
        plan_day_id uuid NOT NULL REFERENCES plan_days,
        nutrition_template_day_id uuid NOT NULL REFERENCES nutrition_template_days,
        local_date date NOT NULL,
        status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','EXEMPT')),
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        CHECK ((status='SCHEDULED') = (resolved_at IS NULL)),
        UNIQUE (enrollment_id, local_date),
        UNIQUE (enrollment_id, plan_day_id),
        UNIQUE (enrollment_id, nutrition_template_day_id)
      );

      CREATE TABLE completed_training_months (
        enrollment_id uuid NOT NULL REFERENCES program_enrollments ON DELETE CASCADE,
        monthly_plan_id uuid NOT NULL REFERENCES monthly_plans,
        completed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (enrollment_id, monthly_plan_id)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE completed_training_months,scheduled_days,program_enrollments;',
    );
  }
}
