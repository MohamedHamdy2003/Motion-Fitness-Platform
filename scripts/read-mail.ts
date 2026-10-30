import db from '../src/infrastructure/database/data-source';
import { decrypt } from '../src/common/crypto';
import { environment } from '../src/config/environment';
async function main() {
  if (
    environment().NODE_ENV === 'production' ||
    environment().MAIL_MODE !== 'capture'
  )
    throw Error('Local capture only');
  await db.initialize();
  const [job] = await db.query(
    `SELECT payload FROM jobs WHERE kind='MAIL' AND user_id=(SELECT id FROM users WHERE email_normalized=$1) ORDER BY created_at DESC LIMIT 1`,
    [process.argv[2]],
  );
  if (!job) throw Error('No captured mail');
  process.stdout.write(
    decrypt(job.payload.encrypted, environment().MAIL_ENCRYPTION_KEY) + '\n',
  );
  await db.destroy();
}
void main().catch(() => {
  process.stderr.write('Unable to read local mail\n');
  process.exitCode = 1;
});
