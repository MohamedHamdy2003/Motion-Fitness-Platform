import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserSuspendedStatus1793448030000 implements MigrationInterface {
  name = 'UserSuspendedStatus1793448030000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS users_status_check,
        ADD CONSTRAINT users_status_check
          CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING'));
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE users SET status = 'ACTIVE' WHERE status = 'SUSPENDED';
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS users_status_check,
        ADD CONSTRAINT users_status_check
          CHECK (status IN ('ACTIVE', 'DELETION_PENDING'));
    `);
  }
}
