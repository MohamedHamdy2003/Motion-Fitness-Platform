import { MigrationInterface, QueryRunner } from 'typeorm';

export class PerformanceIndexes1793448031000 implements MigrationInterface {
  name = 'PerformanceIndexes1793448031000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- Users, roles & auth hot paths + cleanup jobs
      CREATE INDEX IF NOT EXISTS users_status_created_idx
        ON users (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS user_roles_role_user_idx
        ON user_roles (role_code, user_id);
      CREATE INDEX IF NOT EXISTS auth_sessions_family_idx
        ON auth_sessions (family_id);
      CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx
        ON auth_sessions (expires_at);
      CREATE INDEX IF NOT EXISTS auth_refresh_tokens_session_idx
        ON auth_refresh_tokens (session_id);
      CREATE INDEX IF NOT EXISTS auth_refresh_tokens_expires_idx
        ON auth_refresh_tokens (expires_at);
      CREATE INDEX IF NOT EXISTS verification_tokens_active_user_idx
        ON verification_tokens (user_id, purpose, expires_at DESC)
        WHERE consumed_at IS NULL;
      CREATE INDEX IF NOT EXISTS verification_tokens_expires_idx
        ON verification_tokens (expires_at);
      CREATE INDEX IF NOT EXISTS auth_challenges_expires_idx
        ON auth_challenges (expires_at);
      CREATE INDEX IF NOT EXISTS jobs_completed_at_idx
        ON jobs (completed_at)
        WHERE completed_at IS NOT NULL;

      -- Media library
      CREATE INDEX IF NOT EXISTS media_assets_owner_idx
        ON media_assets (owner_user_id)
        WHERE owner_user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS media_assets_library_idx
        ON media_assets (library_archived, status, created_at DESC, id)
        WHERE library_asset;

      -- Content & nutrition library LATERAL latest-version scans and FKs
      CREATE INDEX IF NOT EXISTS exercise_revisions_latest_idx
        ON exercise_revisions (exercise_id, version DESC);
      CREATE INDEX IF NOT EXISTS food_versions_latest_idx
        ON food_versions (food_id, version DESC);
      CREATE INDEX IF NOT EXISTS food_exchange_group_versions_latest_idx
        ON food_exchange_group_versions (group_id, version DESC);
      CREATE INDEX IF NOT EXISTS meal_versions_latest_idx
        ON meal_versions (meal_id, version DESC);
      CREATE INDEX IF NOT EXISTS program_versions_latest_idx
        ON program_versions (program_id, version DESC);
      CREATE INDEX IF NOT EXISTS food_exchange_members_food_version_idx
        ON food_exchange_members (food_version_id);
      CREATE INDEX IF NOT EXISTS meal_versions_section_status_idx
        ON meal_versions (section_id, status, availability_status);
      CREATE INDEX IF NOT EXISTS meal_items_member_idx
        ON meal_items (default_exchange_member_id);
      CREATE INDEX IF NOT EXISTS food_ingredients_ingredient_idx
        ON food_ingredients (ingredient_id);

      -- Program builder & enrollments
      CREATE INDEX IF NOT EXISTS plan_days_workout_rev_idx
        ON plan_days (workout_revision_id)
        WHERE workout_revision_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS workout_exercises_exercise_rev_idx
        ON workout_exercises (exercise_revision_id);
      CREATE INDEX IF NOT EXISTS program_enrollments_version_idx
        ON program_enrollments (program_version_id);

      -- Mobile execution, dashboard & admin analytics hot paths
      CREATE INDEX IF NOT EXISTS workout_sessions_user_status_idx
        ON workout_sessions (user_id, status, completed_at DESC);
      CREATE INDEX IF NOT EXISTS workout_sessions_completed_at_idx
        ON workout_sessions (completed_at DESC)
        WHERE status = 'COMPLETED';
      CREATE INDEX IF NOT EXISTS scheduled_meals_completed_at_idx
        ON scheduled_meals (completed_at DESC)
        WHERE status = 'COMPLETED';
      CREATE INDEX IF NOT EXISTS daily_fitting_runs_day_created_idx
        ON daily_fitting_runs (scheduled_day_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS user_injuries_user_status_idx
        ON user_injuries (user_id, status, confirmed_at, id);
      CREATE INDEX IF NOT EXISTS user_check_ins_created_idx
        ON user_check_ins (created_at DESC);
      CREATE INDEX IF NOT EXISTS notifications_user_unread_only_idx
        ON notifications (user_id)
        WHERE read_at IS NULL;
      CREATE INDEX IF NOT EXISTS ai_usage_logs_status_created_idx
        ON ai_usage_logs (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx
        ON legal_acceptances (user_id, accepted_at DESC);
      CREATE INDEX IF NOT EXISTS legal_documents_list_idx
        ON legal_documents (locale, type, active DESC, published_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS
        users_status_created_idx,
        user_roles_role_user_idx,
        auth_sessions_family_idx,
        auth_sessions_expires_idx,
        auth_refresh_tokens_session_idx,
        auth_refresh_tokens_expires_idx,
        verification_tokens_active_user_idx,
        verification_tokens_expires_idx,
        auth_challenges_expires_idx,
        jobs_completed_at_idx,
        media_assets_owner_idx,
        media_assets_library_idx,
        exercise_revisions_latest_idx,
        food_versions_latest_idx,
        food_exchange_group_versions_latest_idx,
        meal_versions_latest_idx,
        program_versions_latest_idx,
        food_exchange_members_food_version_idx,
        meal_versions_section_status_idx,
        meal_items_member_idx,
        food_ingredients_ingredient_idx,
        plan_days_workout_rev_idx,
        workout_exercises_exercise_rev_idx,
        program_enrollments_version_idx,
        workout_sessions_user_status_idx,
        workout_sessions_completed_at_idx,
        scheduled_meals_completed_at_idx,
        daily_fitting_runs_day_created_idx,
        user_injuries_user_status_idx,
        user_check_ins_created_idx,
        notifications_user_unread_only_idx,
        ai_usage_logs_status_created_idx,
        legal_acceptances_user_idx,
        legal_documents_list_idx;
    `);
  }
}
