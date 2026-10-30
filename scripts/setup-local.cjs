const fs = require('node:fs');
const crypto = require('node:crypto');
if (fs.existsSync('.env')) {
  process.stdout.write('.env already exists; preserved\n');
  process.exit(0);
}
const template = fs
  .readFileSync('.env.example', 'utf8')
  .replace(
    'replace-with-at-least-32-random-bytes-before-running',
    crypto.randomBytes(48).toString('hex'),
  )
  .replace('MAIL_MODE=disabled', 'MAIL_MODE=capture')
  .replace(
    'MAIL_ENCRYPTION_KEY=',
    'MAIL_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'),
  );
fs.writeFileSync('.env', template, { flag: 'wx' });
process.stdout.write(
  'Created ignored local .env with generated keys; policies remain unconfigured\n',
);
