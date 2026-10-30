const { spawnSync } = require('node:child_process');
const path = require('node:path');
const cli = path.join(
  path.dirname(require.resolve('@usebruno/cli/package.json')),
  'bin',
  'bru.js',
);
const result = spawnSync(
  process.execPath,
  [cli, 'run', 'smoke', '--env', process.env.BRUNO_ENV || 'local', '--bail'],
  { cwd: path.join(__dirname, '..', 'bruno'), stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
