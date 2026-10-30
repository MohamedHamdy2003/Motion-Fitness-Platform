import db from '../data-source';
import { seedContent } from './seed-runner';
void db
  .initialize()
  .then(() => seedContent(db))
  .then(() =>
    process.stdout.write(
      'Content stage validated; no approved content dataset supplied\n',
    ),
  )
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch(() => {
    process.stderr.write('Content seed failed\n');
    process.exitCode = 1;
  });
