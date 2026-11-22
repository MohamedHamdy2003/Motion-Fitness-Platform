import { MigrationInterface, QueryRunner } from 'typeorm';

export class DecoupleProgramHintApprovers1793448019000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE program_hint_versions
        DROP CONSTRAINT program_hint_versions_approved_by_fkey,
        DROP CONSTRAINT program_hint_versions_check,
        ADD CONSTRAINT program_hint_versions_approved_by_fkey
          FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
        ADD CONSTRAINT program_hint_versions_check CHECK (
          (status='DRAFT' AND approved_by IS NULL AND approved_at IS NULL)
          OR (status='APPROVED' AND approved_at IS NOT NULL)
        );

      CREATE OR REPLACE FUNCTION protect_approved_program_hint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_OP='DELETE' THEN
          IF OLD.status='APPROVED' THEN RAISE EXCEPTION 'Approved program hint is immutable'; END IF;
          RETURN OLD;
        END IF;

        IF TG_OP='UPDATE' AND OLD.status='APPROVED' THEN
          -- The foreign key clears attribution after its referenced account is deleted.
          IF OLD.approved_by IS NOT NULL AND NEW.approved_by IS NULL
             AND (to_jsonb(NEW) - 'approved_by') = (to_jsonb(OLD) - 'approved_by')
             AND NOT EXISTS (SELECT 1 FROM users WHERE id=OLD.approved_by) THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'Approved program hint is immutable';
        END IF;

        IF NEW.status='APPROVED' AND NEW.approved_by IS NULL THEN
          RAISE EXCEPTION 'A program hint requires an approver at approval';
        END IF;
        RETURN NEW;
      END $$;

      DROP TRIGGER immutable_program_hint ON program_hint_versions;
      CREATE TRIGGER immutable_program_hint BEFORE INSERT OR UPDATE OR DELETE
        ON program_hint_versions FOR EACH ROW EXECUTE FUNCTION protect_approved_program_hint();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE program_hint_versions
        DROP CONSTRAINT program_hint_versions_approved_by_fkey,
        DROP CONSTRAINT program_hint_versions_check,
        ADD CONSTRAINT program_hint_versions_approved_by_fkey
          FOREIGN KEY (approved_by) REFERENCES users(id),
        ADD CONSTRAINT program_hint_versions_check CHECK (
          (status='DRAFT' AND approved_by IS NULL AND approved_at IS NULL)
          OR (status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
        ) NOT VALID;

      -- Deleted accounts cannot be restored. Preserve approvals already anonymized by this migration.
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM program_hint_versions WHERE status='APPROVED' AND approved_by IS NULL) THEN
          ALTER TABLE program_hint_versions VALIDATE CONSTRAINT program_hint_versions_check;
        END IF;
      END $$;

      DROP TRIGGER immutable_program_hint ON program_hint_versions;
      CREATE OR REPLACE FUNCTION protect_approved_program_hint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.status='APPROVED' THEN RAISE EXCEPTION 'Approved program hint is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_program_hint BEFORE UPDATE OR DELETE
        ON program_hint_versions FOR EACH ROW EXECUTE FUNCTION protect_approved_program_hint();
    `);
  }
}
