// Uses the existing Git Credential Manager session. Never prints credentials.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
async function main() {
  const credential = execFileSync(
    'git',
    ['-c', 'credential.interactive=never', 'credential', 'fill'],
    {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const match = credential.match(/^password=(.+)$/m);
  if (!match) throw Error('GitHub authentication unavailable');
  const [method = 'GET', path = '', bodyFile] = process.argv.slice(2);
  if (!path.startsWith('/repos/MohamedHamdy2003/Motion-Fitness-Platform'))
    throw Error('Only the authorized repository is supported');
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      authorization: 'Bearer ' + match[1].trim(),
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(bodyFile ? { 'content-type': 'application/json' } : {}),
    },
    body: bodyFile ? fs.readFileSync(bodyFile, 'utf8') : undefined,
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }
  if (!response.ok) {
    process.stderr.write(
      JSON.stringify({ status: response.status, message: data.message }) + '\n',
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
void main().catch(() => {
  process.stderr.write('GitHub request failed; check authentication/network\n');
  process.exitCode = 1;
});
