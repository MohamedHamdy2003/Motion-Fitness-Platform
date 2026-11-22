import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationsCheckInsSupportAndIndexes1793448027000 implements MigrationInterface {
  name = 'NotificationsCheckInsSupportAndIndexes1793448027000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type text NOT NULL CHECK (type IN ('PROGRAM_READY','PROGRAM_CHANGE_READY','CHECKIN_COMPLETED','WATER_REMINDER','SYSTEM')),
        title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
        body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX notifications_user_unread_idx ON notifications(user_id, created_at DESC, id DESC);

      ALTER TABLE user_settings
        ADD COLUMN water_reminder_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN water_reminder_interval_minutes integer NOT NULL DEFAULT 60
          CHECK (water_reminder_interval_minutes BETWEEN 15 AND 480),
        ADD COLUMN water_reminder_start time NOT NULL DEFAULT '08:00',
        ADD COLUMN water_reminder_end time NOT NULL DEFAULT '22:00',
        ADD COLUMN water_reminder_stop_on_goal boolean NOT NULL DEFAULT true;

      CREATE TABLE weight_logs (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date date NOT NULL,
        weight_kg numeric NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 10000),
        source text NOT NULL CHECK (source IN ('ONBOARDING','PROFILE','CHECK_IN')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, local_date)
      );
      CREATE INDEX weight_logs_user_date_idx ON weight_logs(user_id, local_date ASC);

      CREATE TABLE user_check_ins (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        enrollment_id uuid REFERENCES program_enrollments(id) ON DELETE SET NULL,
        local_date date NOT NULL,
        workout_difficulty text NOT NULL CHECK (workout_difficulty IN ('EASY','MODERATE','HARD','VERY_HARD')),
        nutrition_adherence text NOT NULL CHECK (nutrition_adherence IN ('LOW','PARTIAL','HIGH','COMPLETE')),
        weight_kg numeric NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 10000),
        notes text CHECK (notes IS NULL OR length(notes) <= 1000),
        automated_summary text NOT NULL CHECK (length(btrim(automated_summary)) BETWEEN 1 AND 2000),
        next_check_in_date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX check_ins_user_date_idx ON user_check_ins(user_id, local_date DESC, created_at DESC);

      CREATE TABLE faq_entries (
        id uuid PRIMARY KEY,
        slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,120}$'),
        category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 80),
        locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar')),
        question text NOT NULL CHECK (length(btrim(question)) BETWEEN 1 AND 500),
        answer text NOT NULL CHECK (length(btrim(answer)) BETWEEN 1 AND 5000),
        display_order integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX faq_entries_active_locale_idx ON faq_entries(active, locale, category, display_order);

      CREATE TABLE legal_documents (
        id uuid PRIMARY KEY,
        type text NOT NULL CHECK (type IN ('TERMS','PRIVACY')),
        version text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 64),
        locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar')),
        title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
        content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 50000),
        active boolean NOT NULL DEFAULT false,
        published_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (type, version, locale)
      );
      CREATE UNIQUE INDEX one_active_legal_doc_per_locale
        ON legal_documents(type, locale) WHERE active;

      CREATE TABLE legal_acceptances (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        legal_document_id uuid NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
        accepted_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, legal_document_id)
      );

      CREATE INDEX scheduled_days_enrollment_status_idx ON scheduled_days(enrollment_id, status, local_date);
      CREATE INDEX scheduled_meals_day_status_idx ON scheduled_meals(nutrition_day_id, status);
      CREATE INDEX rate_limits_expires_idx ON rate_limits(expires_at);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS rate_limits_expires_idx;
      DROP INDEX IF EXISTS scheduled_meals_day_status_idx;
      DROP INDEX IF EXISTS scheduled_days_enrollment_status_idx;
      DROP TABLE IF EXISTS legal_acceptances;
      DROP INDEX IF EXISTS one_active_legal_doc_per_locale;
      DROP TABLE IF EXISTS legal_documents;
      DROP INDEX IF EXISTS faq_entries_active_locale_idx;
      DROP TABLE IF EXISTS faq_entries;
      DROP INDEX IF EXISTS check_ins_user_date_idx;
      DROP TABLE IF EXISTS user_check_ins;
      DROP INDEX IF EXISTS weight_logs_user_date_idx;
      DROP TABLE IF EXISTS weight_logs;
      ALTER TABLE user_settings
        DROP COLUMN IF EXISTS water_reminder_stop_on_goal,
        DROP COLUMN IF EXISTS water_reminder_end,
        DROP COLUMN IF EXISTS water_reminder_start,
        DROP COLUMN IF EXISTS water_reminder_interval_minutes,
        DROP COLUMN IF EXISTS water_reminder_enabled;
      DROP INDEX IF EXISTS notifications_user_unread_idx;
      DROP TABLE IF EXISTS notifications;
    `);
  }
}
