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
  const rows = await query(
    db,
    `INSERT INTO user_roles(user_id,role_code) SELECT id,'CONTENT_EDITOR' FROM users WHERE email_normalized=$1 AND status='ACTIVE' ON CONFLICT DO NOTHING RETURNING user_id`,
    [address],
  );
  const [user] = await db.query(
    `SELECT id FROM users WHERE email_normalized=$1 AND status='ACTIVE'`,
    [address],
  );
  if (!user) throw Error('Register a local account first');
  process.stdout.write(
    rows.length
      ? 'Local content-editor role granted\n'
      : 'Local content-editor role already present\n',
  );
}
void main()
  .catch(() => {
    process.stderr.write(
      'Unable to grant local editor role; check environment, account and lookup seeds\n',
    );
    process.exitCode = 1;
  })
  .finally(() => (db.isInitialized ? db.destroy() : undefined));
