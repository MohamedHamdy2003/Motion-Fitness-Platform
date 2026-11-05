import { MigrationInterface, QueryRunner } from 'typeorm';

export class FitnessLevelLookups1793448008000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE fitness_levels(
        code text PRIMARY KEY,
        label text NOT NULL,
        display_order integer NOT NULL UNIQUE
      );
      INSERT INTO fitness_levels(code,label,display_order) VALUES
        ('BEGINNER','Beginner',1),
        ('INTERMEDIATE','Intermediate',2),
        ('ADVANCED','Advanced',3);

      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_fitness_level_check;
      ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_fitness_level_lookup_fk
        FOREIGN KEY(fitness_level) REFERENCES fitness_levels(code);

      ALTER TABLE program_versions DROP CONSTRAINT IF EXISTS program_versions_ideal_level_check;
      ALTER TABLE program_versions DROP CONSTRAINT IF EXISTS program_versions_check1;
      ALTER TABLE program_versions
        ADD CONSTRAINT program_versions_ideal_level_lookup_fk
        FOREIGN KEY(ideal_level) REFERENCES fitness_levels(code);

      CREATE TABLE program_version_supported_levels(
        program_version_id uuid NOT NULL REFERENCES program_versions ON DELETE CASCADE,
        fitness_level_code text NOT NULL REFERENCES fitness_levels(code),
        PRIMARY KEY(program_version_id,fitness_level_code)
      );
      INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code)
        SELECT pv.id,level.code
        FROM program_versions pv
        CROSS JOIN LATERAL unnest(pv.supported_levels) AS level(code);
      ALTER TABLE program_versions DROP COLUMN supported_levels;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE program_versions ADD COLUMN supported_levels text[] NOT NULL DEFAULT '{}';
      UPDATE program_versions pv SET supported_levels=COALESCE((
        SELECT array_agg(pvsl.fitness_level_code ORDER BY fl.display_order)
        FROM program_version_supported_levels pvsl
        JOIN fitness_levels fl ON fl.code=pvsl.fitness_level_code
        WHERE pvsl.program_version_id=pv.id
      ),'{}');
      ALTER TABLE program_versions
        ADD CONSTRAINT program_versions_ideal_level_check
        CHECK(ideal_level IN ('BEGINNER','INTERMEDIATE','ADVANCED'));
      ALTER TABLE program_versions
        ADD CONSTRAINT program_versions_check1
        CHECK(cardinality(supported_levels)>0 AND supported_levels <@ ARRAY['BEGINNER','INTERMEDIATE','ADVANCED']::text[] AND ideal_level=ANY(supported_levels));
      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_fitness_level_lookup_fk;
      ALTER TABLE program_versions DROP CONSTRAINT IF EXISTS program_versions_ideal_level_lookup_fk;
      DROP TABLE program_version_supported_levels;
      DROP TABLE fitness_levels;
    `);
  }
}
