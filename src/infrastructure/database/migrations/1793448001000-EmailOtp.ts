import { MigrationInterface, QueryRunner } from 'typeorm';
export class EmailOtp1793448001000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE verification_tokens ADD COLUMN is_otp boolean NOT NULL DEFAULT false, ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5); UPDATE verification_tokens SET consumed_at=now() WHERE purpose IN ('EMAIL_VERIFICATION','PASSWORD_RESET') AND consumed_at IS NULL;`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE verification_tokens SET consumed_at=now() WHERE is_otp AND consumed_at IS NULL; ALTER TABLE verification_tokens DROP COLUMN is_otp,DROP COLUMN attempts;`,
    );
  }
}
