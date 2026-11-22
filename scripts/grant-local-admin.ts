import { query } from '../src/infrastructure/database/query';
import db from '../src/infrastructure/database/data-source';
import { environment } from '../src/config/environment';
import { email, parse } from '../src/common/http';
async function main() {
  const e = environment();
  const target = new URL(e.DATABASE_URL);
  if (
    e.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  )
    throw Error('Local development database required');
  const address = parse(email, process.argv[2]);
  await db.initialize();
  const [user] = await db.query(
    `SELECT id FROM users WHERE email_normalized=$1 AND status='ACTIVE'`,
    [address],
  );
  if (!user) throw Error('Register a local account first');
  const [existingAdmin] = await query(
    db,
    `SELECT user_id FROM user_roles WHERE role_code='ADMIN' LIMIT 1`,
  );
  if (existingAdmin) {
    if (existingAdmin.user_id === user.id) {
      process.stdout.write('Local admin role already present\n');
      return;
    }
    throw Error('An admin account already exists');
  }
  await query(
    db,
    `INSERT INTO user_roles(user_id,role_code) VALUES($1,'ADMIN')`,
    [user.id],
  );
  process.stdout.write('Local admin role granted\n');
}
void main()
  .catch((error: unknown) => {
    const msg =
      error instanceof Error
        ? error.message
        : 'Unable to grant local admin role';
    process.stderr.write(
      `${msg}; check environment, account and lookup seeds\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => (db.isInitialized ? db.destroy() : undefined));
