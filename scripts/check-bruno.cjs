// Ensure every literal Nest controller route has a versioned Bruno request.
// This checks endpoint coverage, not request bodies or response contracts.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function decorators(node) {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [])
    .map((d) => d.expression)
    .filter(ts.isCallExpression);
}
function route(call) {
  if (!call.arguments.length) return '';
  if (!ts.isStringLiteral(call.arguments[0])) {
    throw new Error(
      'Non-literal route requires extending the Bruno coverage check',
    );
  }
  return call.arguments[0].text;
}
const requests = files(path.join(root, 'bruno'))
  .filter((f) => f.endsWith('.bru'))
  .flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const method = text.match(
      /^(get|post|patch|put|delete|head|options)\s*\{/m,
    )?.[1];
    const url = text.match(/^\s*url:\s*\{\{baseUrl\}\}([^\s?]*)/m)?.[1];
    return method && url ? [{ method, url }] : [];
  });
let checked = 0;
const missing = [];
for (const file of files(path.join(root, 'src')).filter((f) =>
  f.endsWith('.controller.ts'),
)) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const node of source.statements.filter(ts.isClassDeclaration)) {
    const controller = decorators(node).find(
      (d) => d.expression.getText(source) === 'Controller',
    );
    if (!controller) continue;
    for (const member of node.members) {
      for (const call of decorators(member)) {
        const method = call.expression.getText(source).toLowerCase();
        if (
          ![
            'get',
            'post',
            'patch',
            'put',
            'delete',
            'head',
            'options',
          ].includes(method)
        )
          continue;
        const url =
          '/' + [route(controller), route(call)].filter(Boolean).join('/');
        const pattern = new RegExp(
          '^' +
            url
              .split('/')
              .map((part) =>
                part.startsWith(':')
                  ? '[^/]+'
                  : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              )
              .join('/') +
            '$',
        );
        checked++;
        if (!requests.some((r) => r.method === method && pattern.test(r.url)))
          missing.push(`${method.toUpperCase()} ${url}`);
      }
    }
  }
}
if (!checked || missing.length) {
  console.error('Missing Bruno requests:', missing.join('\n'));
  process.exitCode = 1;
} else console.log(`Bruno covers all ${checked} controller routes.`);
