import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBodyFat1793404800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE user_profiles SET profile_revision=profile_revision+1
      WHERE user_id IN (SELECT user_id FROM body_measurements WHERE body_fat_percent IS NOT NULL);
      DELETE FROM idempotency_keys WHERE scope='measurement'
        AND resource_id IN (SELECT id FROM body_measurements WHERE weight_kg IS NULL);
      DELETE FROM body_measurements WHERE weight_kg IS NULL;
      ALTER TABLE body_measurements
        DROP COLUMN body_fat_percent,
        DROP COLUMN body_fat_method,
        ALTER COLUMN weight_kg SET NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // Restores the old schema only; removed observations cannot be recreated.
    await q.query(`
      ALTER TABLE body_measurements
        ALTER COLUMN weight_kg DROP NOT NULL,
        ADD COLUMN body_fat_percent numeric CHECK(body_fat_percent>0 AND body_fat_percent<100),
        ADD COLUMN body_fat_method text,
        ADD CONSTRAINT body_measurements_has_value CHECK(weight_kg IS NOT NULL OR body_fat_percent IS NOT NULL),
        ADD CONSTRAINT body_measurements_fat_method CHECK(
          (body_fat_percent IS NULL AND body_fat_method IS NULL) OR
          (body_fat_percent IS NOT NULL AND body_fat_method IS NOT NULL));
    `);
  }
}
