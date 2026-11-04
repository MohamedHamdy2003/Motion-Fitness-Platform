import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileGender1793448005000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_profiles
        ADD COLUMN gender text
        CHECK(gender IS NULL OR gender IN ('FEMALE','MALE','NON_BINARY','PREFER_NOT_TO_SAY'));
      DELETE FROM idempotency_keys WHERE scope='onboarding';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE user_profiles DROP COLUMN gender;`);
  }
}
