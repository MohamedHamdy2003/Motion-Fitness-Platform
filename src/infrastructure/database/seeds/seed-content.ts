import { importLibrary } from './import-library';
import db from '../data-source';
import { seedContent } from './seed-runner';
import { resolve } from 'node:path';
const datasetPath =
  process.env.CONTENT_DATASET_PATH ??
  resolve(__dirname, 'data/nutrition-library.v1.json');
void db
  .initialize()
  .then(() => seedContent(db))
  .then(() => importLibrary(db, datasetPath))
  .then(() =>
    process.stdout.write(
      `Content dataset imported as drafts: ${datasetPath}\n`,
    ),
  )
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch(() => {
    process.stderr.write('Content seed failed\n');
    process.exitCode = 1;
  });
