import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProgramMatching1793448017000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
 CREATE TABLE matching_rulesets(id uuid PRIMARY KEY,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),active boolean NOT NULL DEFAULT false,instruction_version text NOT NULL,instructions text NOT NULL,model text NOT NULL,policy_version text NOT NULL,schema_version text NOT NULL,evaluation_reference text,created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,CHECK(NOT active OR status='PUBLISHED'));
 CREATE UNIQUE INDEX one_active_matching_ruleset ON matching_rulesets(active) WHERE active;
 CREATE FUNCTION protect_matching_ruleset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status<>'DRAFT' AND NEW.status NOT IN (OLD.status,'ARCHIVED') THEN RAISE EXCEPTION 'Matching lifecycle cannot revert to draft'; END IF;
 IF OLD.status<>'DRAFT' AND (NEW.instructions,NEW.model,NEW.instruction_version,NEW.policy_version,NEW.schema_version,NEW.evaluation_reference) IS DISTINCT FROM (OLD.instructions,OLD.model,OLD.instruction_version,OLD.policy_version,OLD.schema_version,OLD.evaluation_reference) THEN RAISE EXCEPTION 'Published matching configuration is immutable'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER immutable_matching_ruleset BEFORE UPDATE ON matching_rulesets FOR EACH ROW EXECUTE FUNCTION protect_matching_ruleset();
 CREATE TABLE recommendation_runs(id uuid PRIMARY KEY,user_id uuid REFERENCES users ON DELETE CASCADE,ruleset_id uuid REFERENCES matching_rulesets,kind text NOT NULL CHECK(kind IN ('USER','SIMULATION')),status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','MATCH','NO_MATCH','FAILED','STALE')),input_hash text NOT NULL,profile_snapshot jsonb NOT NULL,candidates jsonb NOT NULL,decision jsonb,failure_code text,attempts integer NOT NULL DEFAULT 0,lease_token uuid,lease_expires_at timestamptz,available_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,duration_ms integer, CHECK(kind<>'USER' OR user_id IS NOT NULL));
 CREATE INDEX matching_run_user ON recommendation_runs(user_id,created_at DESC,id);
 CREATE INDEX matching_run_queue ON recommendation_runs(available_at) WHERE status IN ('PENDING','PROCESSING');
 `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE recommendation_runs; DROP TABLE matching_rulesets; DROP FUNCTION protect_matching_ruleset();',
    );
  }
}
