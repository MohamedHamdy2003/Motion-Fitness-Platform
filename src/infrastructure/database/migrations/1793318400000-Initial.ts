import { MigrationInterface, QueryRunner } from 'typeorm';
export class Initial1793318400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
CREATE TABLE users (id uuid PRIMARY KEY, email_normalized text UNIQUE, password_hash text, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DELETION_PENDING')), verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rate_limits(key text NOT NULL,bucket bigint NOT NULL,count integer NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(key,bucket));
CREATE TABLE roles(code text PRIMARY KEY);
CREATE TABLE user_roles(user_id uuid REFERENCES users ON DELETE CASCADE,role_code text REFERENCES roles,PRIMARY KEY(user_id,role_code));
CREATE TABLE auth_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,family_id uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,reauthenticated_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE auth_refresh_tokens(id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES auth_sessions ON DELETE CASCADE,token_hash text UNIQUE NOT NULL,parent_token_id uuid UNIQUE REFERENCES auth_refresh_tokens ON DELETE CASCADE,expires_at timestamptz NOT NULL,consumed_at timestamptz,revoked_at timestamptz);
CREATE TABLE verification_tokens(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,purpose text NOT NULL CHECK(purpose IN ('EMAIL_VERIFICATION','PASSWORD_RESET','REAUTH_LINK','REAUTH_DELETE')),token_hash text UNIQUE NOT NULL,session_id uuid REFERENCES auth_sessions ON DELETE CASCADE,expires_at timestamptz NOT NULL,consumed_at timestamptz);
CREATE TABLE auth_challenges(id uuid PRIMARY KEY,user_id uuid REFERENCES users ON DELETE CASCADE,provider text NOT NULL CHECK(provider IN ('GOOGLE','APPLE')),purpose text NOT NULL CHECK(purpose IN ('SIGN_IN','LINK','REAUTHENTICATE')),nonce_hash text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz);
CREATE TABLE auth_identities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,provider text NOT NULL,provider_subject text NOT NULL,provider_email text,provider_refresh_token_encrypted text,UNIQUE(provider,provider_subject),UNIQUE(user_id,provider));
CREATE TABLE media_assets(id uuid PRIMARY KEY,owner_user_id uuid REFERENCES users ON DELETE CASCADE,storage_key text UNIQUE NOT NULL,mime text NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=5242880),status text NOT NULL CHECK(status IN ('PENDING','READY')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_profiles(user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,name text,phone text,height_cm numeric CHECK(height_cm>0),primary_goal text CHECK(primary_goal IN ('FAT_LOSS','STRENGTH_HYPERTROPHY')),fitness_level text CHECK(fitness_level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),training_days_per_week integer CHECK(training_days_per_week IN (2,3,4,5)),timezone text NOT NULL DEFAULT 'UTC',locale text NOT NULL DEFAULT 'en',avatar_media_id uuid REFERENCES media_assets ON DELETE SET NULL,date_of_birth date,profile_revision integer NOT NULL DEFAULT 0,onboarded_at timestamptz);
CREATE TABLE body_measurements(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,measured_at timestamptz NOT NULL,weight_kg numeric CHECK(weight_kg>0),body_fat_percent numeric CHECK(body_fat_percent>0 AND body_fat_percent<100),body_fat_method text,created_at timestamptz NOT NULL DEFAULT now(),CHECK(weight_kg IS NOT NULL OR body_fat_percent IS NOT NULL),CHECK((body_fat_percent IS NULL AND body_fat_method IS NULL) OR (body_fat_percent IS NOT NULL AND body_fat_method IS NOT NULL)));
CREATE INDEX measurements_user_date ON body_measurements(user_id,measured_at DESC,id);
CREATE TABLE user_settings(user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,reminders boolean NOT NULL DEFAULT false,theme text NOT NULL DEFAULT 'SYSTEM' CHECK(theme IN ('SYSTEM','LIGHT','DARK')),quiet_hours jsonb,version integer NOT NULL DEFAULT 0);
CREATE TABLE body_areas(code text PRIMARY KEY,parent_code text REFERENCES body_areas);
CREATE TABLE allergens(code text PRIMARY KEY,label text NOT NULL);
CREATE TABLE food_reference_items(id uuid PRIMARY KEY,name text NOT NULL,kind text NOT NULL CHECK(kind IN ('FOOD','INGREDIENT')));
CREATE TABLE user_restriction_states(user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,injury_revision integer NOT NULL DEFAULT 0);
CREATE TABLE user_injuries(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,body_area_code text NOT NULL REFERENCES body_areas,side text CHECK(side IN ('LEFT','RIGHT','BOTH','UNSPECIFIED')),description text NOT NULL CHECK(length(description) BETWEEN 1 AND 2000),version integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REMOVED')),confirmed_at timestamptz NOT NULL DEFAULT now(),removed_at timestamptz);
CREATE INDEX injuries_user ON user_injuries(user_id);
CREATE TABLE user_food_preferences(user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,revision integer NOT NULL DEFAULT 0);
CREATE TABLE user_allergies(user_id uuid REFERENCES users ON DELETE CASCADE,allergen_code text REFERENCES allergens,PRIMARY KEY(user_id,allergen_code));
CREATE TABLE user_food_exclusions(user_id uuid REFERENCES users ON DELETE CASCADE,food_id uuid REFERENCES food_reference_items,kind text NOT NULL CHECK(kind IN ('DISLIKE','EXCLUSION')),PRIMARY KEY(user_id,food_id,kind));
CREATE TABLE jobs(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('MAIL','ACCOUNT_DELETION')),user_id uuid REFERENCES users ON DELETE CASCADE,payload jsonb NOT NULL DEFAULT '{}',attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_expires_at timestamptz,completed_at timestamptz,last_error_code text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX jobs_pending ON jobs(available_at) WHERE completed_at IS NULL;
CREATE TABLE account_deletions(id uuid PRIMARY KEY,user_id uuid UNIQUE REFERENCES users ON DELETE SET NULL,tracking_hash text UNIQUE NOT NULL,status text NOT NULL DEFAULT 'PENDING',requested_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,expires_at timestamptz NOT NULL);
CREATE TABLE idempotency_keys(user_id uuid REFERENCES users ON DELETE CASCADE,scope text NOT NULL,key text NOT NULL,body_hash text NOT NULL,resource_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,scope,key));
CREATE TABLE domain_events(id uuid PRIMARY KEY,user_id uuid REFERENCES users ON DELETE CASCADE,type text NOT NULL,revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ai_rewrite_runs(id uuid PRIMARY KEY,user_id uuid REFERENCES users ON DELETE CASCADE,status text NOT NULL,model_version text,instruction_version text NOT NULL,duration_ms integer NOT NULL,failure_code text,created_at timestamptz NOT NULL DEFAULT now());
`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE ai_rewrite_runs,domain_events,idempotency_keys,account_deletions,jobs,user_food_exclusions,user_allergies,user_food_preferences,user_injuries,user_restriction_states,food_reference_items,allergens,body_areas,user_settings,body_measurements,user_profiles,media_assets,auth_identities,auth_challenges,verification_tokens,auth_refresh_tokens,auth_sessions,user_roles,roles,users,rate_limits CASCADE`,
    );
  }
}
