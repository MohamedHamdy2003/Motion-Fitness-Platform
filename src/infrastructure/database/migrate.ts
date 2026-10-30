import db from './data-source';
import { seedLookups } from './seeds/seed-runner';
async function main() {
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.query(`SELECT pg_advisory_lock(83002026)`);
    await db.runMigrations();
    await seedLookups(db);
  } finally {
    await runner.query(`SELECT pg_advisory_unlock(83002026)`);
    await runner.release();
    await db.destroy();
  }
}
void main().catch(() => {
  process.stderr.write('Explicit deployment migration failed\n');
  process.exitCode = 1;
});
