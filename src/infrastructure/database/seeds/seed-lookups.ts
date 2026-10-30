import db from '../data-source';
import { seedLookups } from './seed-runner';
void db
  .initialize()
  .then(() => seedLookups(db))
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch(() => {
    process.stderr.write('Lookup seed failed\n');
    process.exitCode = 1;
  });
