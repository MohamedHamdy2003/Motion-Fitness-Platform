require('dotenv').config({ quiet: true });

if (process.env.MAIL_MODE !== 'capture') {
  process.stderr.write(
    'Bruno smoke requires isolated local MAIL_MODE=capture; real email sending is not allowed.\n',
  );
  process.exit(1);
}

const { randomUUID, createDecipheriv } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const cli = path.join(
  path.dirname(require.resolve('@usebruno/cli/package.json')),
  'bin',
  'bru.js',
);
const collectionPath = path.join(__dirname, '..', 'bruno');
const environment = process.env.BRUNO_ENV || 'local';
const environmentFile = path.join(
  collectionPath,
  'environments',
  `${environment}.bru`,
);
const environmentText = fs.readFileSync(environmentFile, 'utf8');
const baseUrl = environmentText.match(/^\s*baseUrl:\s*(\S+)/m)?.[1];
if (!baseUrl) throw Error(`baseUrl is missing from ${environmentFile}`);
if (!process.env.DATABASE_URL || !process.env.MAIL_ENCRYPTION_KEY) {
  throw Error(
    'Bruno smoke needs DATABASE_URL and MAIL_ENCRYPTION_KEY to verify the captured email OTP.',
  );
}

function run(paths, email, password) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'run',
      ...paths,
      '--env',
      environment,
      '--env-var',
      `email=${email}`,
      '--env-var',
      `password=${password}`,
      '--bail',
    ],
    { cwd: collectionPath, stdio: 'inherit' },
  );
  if (result.status !== 0)
    throw Error(`Bruno failed with exit code ${result.status ?? 'unknown'}`);
}

async function verificationCode(email) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT j.payload FROM jobs j JOIN users u ON u.id=j.user_id WHERE u.email_normalized=$1 AND j.kind='MAIL' ORDER BY j.created_at DESC LIMIT 1`,
      [email],
    );
    if (!rows.length) throw Error('Captured verification email was not found.');
    const bytes = Buffer.from(rows[0].payload.encrypted, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.MAIL_ENCRYPTION_KEY, 'hex'),
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(-16));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(12, -16)),
        decipher.final(),
      ]).toString('utf8'),
    );
    const code = payload.text.match(/\b\d{6}\b/)?.[0];
    if (!code) throw Error('Captured email does not contain a six-digit OTP.');
    return code;
  } finally {
    await client.end();
  }
}

async function verifyEmail(email, code) {
  const response = await fetch(`${baseUrl}/auth/verify-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (response.status !== 200)
    throw Error(`Email verification failed with HTTP ${response.status}.`);
}

async function main() {
  const email = `bruno-${randomUUID()}@example.test`;
  const password = 'Disposable-Bruno-Password-123';
  run(
    ['smoke/01-ready.bru', 'smoke/02-register-ephemeral-athlete.bru'],
    email,
    password,
  );
  await verifyEmail(email, await verificationCode(email));
  const requests = fs
    .readdirSync(path.join(collectionPath, 'smoke'))
    .filter(
      (file) =>
        /^\d{2}-/.test(file) &&
        !file.startsWith('01-') &&
        !file.startsWith('02-'),
    )
    .sort()
    .map((file) => path.join('smoke', file));
  run(requests, email, password);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
