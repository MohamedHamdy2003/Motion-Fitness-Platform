import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileTargetWeight1793448009000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_profiles
        ADD COLUMN target_weight_kg numeric,
        ADD CONSTRAINT user_profiles_target_weight_kg_check
          CHECK(target_weight_kg IS NULL OR target_weight_kg > 0);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE user_profiles DROP COLUMN target_weight_kg;`);
  }
}
