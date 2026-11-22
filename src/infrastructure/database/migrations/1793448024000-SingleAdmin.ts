import { MigrationInterface, QueryRunner } from 'typeorm';

export class SingleAdmin1793448024000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const [{ count }] = await q.query(
      "SELECT count(*)::integer AS count FROM user_roles WHERE role_code='ADMIN'",
    );
    if (count > 1) {
      throw new Error(
        'Choose the existing administrator before applying the single-admin migration',
      );
    }
    await q.query(
      "CREATE UNIQUE INDEX user_roles_single_admin ON user_roles(role_code) WHERE role_code='ADMIN'",
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX user_roles_single_admin');
  }
}
