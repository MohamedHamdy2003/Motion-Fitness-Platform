import db from '../data-source';
import { seedPublishedProgramsAndRuleset } from './program-catalog';

void db
  .initialize()
  .then(() => seedPublishedProgramsAndRuleset(db))
  .then((summary) =>
    process.stdout.write(
      `Programs and Gemini matching ruleset ready: ${JSON.stringify(summary)}\n`,
    ),
  )
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch((error: unknown) => {
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    process.stderr.write(`Program seed failed: ${detail}\n`);
    process.exitCode = 1;
  });
