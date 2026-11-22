import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/infrastructure/swagger/openapi-spec';

function collectControllerFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectControllerFiles(file)
      : file.endsWith('.controller.ts')
        ? [file]
        : [];
  });
}

function getDecorators(node: ts.Node): ts.CallExpression[] {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [])
    .map((d) => d.expression)
    .filter(ts.isCallExpression);
}

function getRouteLiteral(call: ts.CallExpression): string {
  if (!call.arguments.length) return '';
  const arg = call.arguments[0];
  return ts.isStringLiteral(arg) ? arg.text : '';
}

function extractControllerRoutes(): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  const srcRoot = path.resolve(__dirname, '../../src');
  for (const file of collectControllerFiles(srcRoot)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements.filter(ts.isClassDeclaration)) {
      const controller = getDecorators(node).find(
        (d) => d.expression.getText(source) === 'Controller',
      );
      if (!controller) continue;
      for (const member of node.members) {
        for (const call of getDecorators(member)) {
          const method = call.expression.getText(source).toLowerCase();
          if (!['get', 'post', 'put', 'patch', 'delete'].includes(method))
            continue;
          const expressPath =
            '/' +
            [getRouteLiteral(controller), getRouteLiteral(call)]
              .filter(Boolean)
              .join('/');
          const openApiPath = expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
          routes.push({ method, path: openApiPath });
        }
      }
    }
  }
  return routes;
}

describe('Swagger / OpenAPI 3.0 specification', () => {
  it('covers 100% of NestJS controller routes in the combined OpenAPI spec', () => {
    const allDoc = buildOpenApiDocument('all');
    const controllerRoutes = extractControllerRoutes();
    const missing: string[] = [];

    for (const route of controllerRoutes) {
      const pathEntry = allDoc.paths[route.path] as
        Record<string, unknown> | undefined;
      if (!pathEntry || !pathEntry[route.method]) {
        missing.push(`${route.method.toUpperCase()} ${route.path}`);
      }
    }

    expect(controllerRoutes.length).toBeGreaterThanOrEqual(157);
    expect(missing).toEqual([]);
  });

  it('strictly isolates Customer (Mobile) endpoints from Admin endpoints', () => {
    const customerDoc = buildOpenApiDocument('customer');
    const adminDoc = buildOpenApiDocument('admin');

    const customerPaths = Object.keys(customerDoc.paths);
    const adminPaths = Object.keys(adminDoc.paths);

    expect(customerPaths.some((p) => p.startsWith('/admin'))).toBe(false);
    expect(customerPaths.length).toBeGreaterThan(70);
    expect(
      adminPaths.filter((p) => p.startsWith('/admin')).length,
    ).toBeGreaterThan(30);
    expect(customerDoc.tags.length).toBeGreaterThanOrEqual(12);
    expect(adminDoc.tags.length).toBeGreaterThanOrEqual(10);
  });
});
