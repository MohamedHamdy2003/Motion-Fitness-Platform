import { importLibrary } from './import-library';
import db from '../data-source';
import { seedContent } from './seed-runner';
void db
  .initialize()
  .then(() => seedContent(db))
  .then(() =>
    process.env.CONTENT_DATASET_PATH
      ? importLibrary(db, process.env.CONTENT_DATASET_PATH)
      : undefined,
  )
  .then(() =>
    process.stdout.write(
      process.env.CONTENT_DATASET_PATH
        ? 'Content dataset imported as drafts\n'
        : 'Content stage validated; no approved content dataset supplied\n',
    ),
  )
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch(() => {
    process.stderr.write('Content seed failed\n');
    process.exitCode = 1;
  });
