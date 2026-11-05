import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrimaryGoalLookups1793448010000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE primary_goals(
        code text PRIMARY KEY,
        label text NOT NULL,
        display_order integer NOT NULL UNIQUE
      );
      INSERT INTO primary_goals(code,label,display_order) VALUES
        ('FAT_LOSS','Fat loss',1),
        ('STRENGTH_HYPERTROPHY','Strength & hypertrophy',2);

      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_primary_goal_check;
      ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_primary_goal_lookup_fk
        FOREIGN KEY(primary_goal) REFERENCES primary_goals(code);

      ALTER TABLE program_versions DROP CONSTRAINT IF EXISTS program_versions_primary_goal_check;
      ALTER TABLE program_versions DROP CONSTRAINT IF EXISTS program_versions_check;
      ALTER TABLE program_versions
        ADD CONSTRAINT program_versions_primary_goal_lookup_fk
        FOREIGN KEY(primary_goal) REFERENCES primary_goals(code);

      CREATE TABLE program_version_supported_goals(
        program_version_id uuid NOT NULL REFERENCES program_versions ON DELETE CASCADE,
        primary_goal_code text NOT NULL REFERENCES primary_goals(code),
        PRIMARY KEY(program_version_id,primary_goal_code)
      );
      INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code)
        SELECT pv.id,goal.code
        FROM program_versions pv
        CROSS JOIN LATERAL unnest(pv.supported_goals) AS goal(code);
      ALTER TABLE program_versions DROP COLUMN supported_goals;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE program_versions ADD COLUMN supported_goals text[] NOT NULL DEFAULT '{}';
      UPDATE program_versions pv SET supported_goals=COALESCE((
        SELECT array_agg(primary_goal_code ORDER BY primary_goal_code)
        FROM program_version_supported_goals
        WHERE program_version_id=pv.id
      ),'{}');
      ALTER TABLE program_versions
        ADD CONSTRAINT program_versions_check
        CHECK(cardinality(supported_goals)>0 AND supported_goals <@ ARRAY['FAT_LOSS','STRENGTH_HYPERTROPHY']::text[] AND primary_goal=ANY(supported_goals));
      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_primary_goal_lookup_fk;
      ALTER TABLE program_versions DROP CONSTRAINT IF EXISTS program_versions_primary_goal_lookup_fk;
      ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_primary_goal_check
        CHECK(primary_goal IN ('FAT_LOSS','STRENGTH_HYPERTROPHY'));
      ALTER TABLE program_versions
        ADD CONSTRAINT program_versions_primary_goal_check
        CHECK(primary_goal IN ('FAT_LOSS','STRENGTH_HYPERTROPHY'));
      DROP TABLE program_version_supported_goals;
      DROP TABLE primary_goals;
    `);
  }
}
