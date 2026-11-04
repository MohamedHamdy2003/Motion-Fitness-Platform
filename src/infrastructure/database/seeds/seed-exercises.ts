import db from '../data-source';
import { seedContent } from './seed-runner';
import { importLibrary } from './import-library';
import { resolve } from 'node:path';

const datasetPath =
  process.env.EXERCISE_DATASET_PATH ??
  resolve(__dirname, 'data/exercise-library.v1.json');

void db
  .initialize()
  .then(() => seedContent(db))
  .then(() => importLibrary(db, datasetPath))
  .then(() =>
    process.stdout.write(
      `Exercise dataset imported as drafts: ${datasetPath}\n`,
    ),
  )
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch((error: unknown) => {
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    process.stderr.write(`Exercise seed failed: ${detail}\n`);
    process.exitCode = 1;
  });
