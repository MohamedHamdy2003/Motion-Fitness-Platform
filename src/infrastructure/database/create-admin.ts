import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { email, newPassword } from '../../common/http';
import { initializeUser } from '../../modules/auth/initialize-user';
import { query } from './query';

export async function createAdmin(
  db: DataSource,
  address: string,
  secret: string,
) {
  const checkedEmail = email.safeParse(address);
  if (!checkedEmail.success) throw new Error('A valid admin email is required');
  const checkedPassword = newPassword.safeParse(secret);
  if (!checkedPassword.success)
    throw new Error(checkedPassword.error.issues[0].message);

  const passwordHash = await argon2.hash(checkedPassword.data);
  return db.transaction(async (manager) => {
    const [admin] = await query(
      manager,
      "SELECT user_id FROM user_roles WHERE role_code='ADMIN' LIMIT 1",
    );
    if (admin) throw new Error('An admin account already exists');
    const id = randomUUID();
    const [user] = await query(
      manager,
      `INSERT INTO users(id,email_normalized,password_hash,verified_at)
       VALUES($1,$2,$3,now()) ON CONFLICT(email_normalized) DO NOTHING RETURNING id`,
      [id, checkedEmail.data, passwordHash],
    );
    if (!user) throw new Error('This email already belongs to an account');
    await initializeUser(manager, id);
    try {
      await query(
        manager,
        "INSERT INTO user_roles(user_id,role_code) VALUES($1,'ADMIN')",
        [id],
      );
    } catch (error) {
      const pg = error as {
        driverError?: { constraint?: string };
        constraint?: string;
      };
      if (
        (pg.driverError?.constraint ?? pg.constraint) ===
        'user_roles_single_admin'
      ) {
        throw new Error('An admin account already exists');
      }
      throw error;
    }
    return id;
  });
}
