import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAdminRoles1793448011000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO roles(code) VALUES('USER'),('ADMIN') ON CONFLICT DO NOTHING;

      INSERT INTO user_roles(user_id,role_code)
        SELECT user_id,'USER' FROM user_roles WHERE role_code='ATHLETE'
        ON CONFLICT DO NOTHING;

      INSERT INTO user_roles(user_id,role_code)
        SELECT user_id,'ADMIN' FROM user_roles WHERE role_code='CONTENT_EDITOR'
        ON CONFLICT DO NOTHING;

      DELETE FROM user_roles WHERE role_code NOT IN ('USER','ADMIN');
      DELETE FROM roles WHERE code NOT IN ('USER','ADMIN');

      INSERT INTO user_roles(user_id,role_code)
        SELECT u.id,'USER' FROM users u
        WHERE NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id)
        ON CONFLICT DO NOTHING;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO roles(code) VALUES
        ('ATHLETE'),('CONTENT_EDITOR'),('NUTRITION_REVIEWER'),('EXERCISE_REVIEWER')
      ON CONFLICT DO NOTHING;
      INSERT INTO user_roles(user_id,role_code)
        SELECT user_id,'ATHLETE' FROM user_roles WHERE role_code='USER'
        ON CONFLICT DO NOTHING;
      DELETE FROM user_roles WHERE role_code='USER';
      DELETE FROM roles WHERE code='USER';
    `);
  }
}
