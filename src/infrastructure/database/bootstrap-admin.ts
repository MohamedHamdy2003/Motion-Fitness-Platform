import { createAdmin } from './create-admin';
import db from './data-source';

async function readPassword() {
  if (process.stdin.isTTY) {
    if (process.env.ADMIN_PASSWORD) {
      return process.env.ADMIN_PASSWORD;
    }
    throw new Error(
      'Pass the password through redirected standard input or ADMIN_PASSWORD environment variable',
    );
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > 1024) throw new Error('Password input is too long');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error(
      'Usage: admin:bootstrap -- email@example.com (password from stdin or ADMIN_PASSWORD)',
    );
  }
  const password = await readPassword();
  await db.initialize();
  await createAdmin(db, process.argv[2], password);
  process.stdout.write('Admin account created\n');
}

void main()
  .catch((error: unknown) => {
    // Keep database driver details and credentials out of the operator's logs.
    const message =
      error instanceof Error &&
      (error.name === 'Error' || error.name === 'TypeError') &&
      !Object.hasOwn(error, 'driverError')
        ? error.message
        : 'Database operation failed';
    process.stderr.write(`Admin setup failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(() => (db.isInitialized ? db.destroy() : undefined));
