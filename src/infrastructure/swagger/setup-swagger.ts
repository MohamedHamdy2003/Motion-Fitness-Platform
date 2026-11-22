import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { getAbsoluteFSPath } from 'swagger-ui-dist';
import { buildOpenApiDocument } from './openapi-spec';

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Motion API — Swagger Documentation</title>
    <link rel="stylesheet" href="/api/v1/docs/assets/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
      .swagger-ui .topbar { background-color: #161b12; border-bottom: 2px solid #84a832; }
      .swagger-ui .topbar .download-url-wrapper .select-label { color: #e9f2d2; font-weight: 600; }
      .swagger-ui .topbar .download-url-wrapper select { border: 2px solid #84a832; border-radius: 6px; padding: 4px 10px; font-weight: 600; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/v1/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/v1/docs/assets/swagger-ui-standalone-preset.js"></script>
    <script src="/api/v1/docs/swagger-init.js"></script>
  </body>
</html>`;

const SWAGGER_INIT_JS = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    urls: [
      { url: '/api/v1/docs/customer.json', name: 'Customer (Mobile App)' },
      { url: '/api/v1/docs/admin.json', name: 'Admin (Studio & Operations)' },
      { url: '/api/v1/docs/all.json', name: 'All Endpoints' }
    ],
    'urls.primaryName': 'Customer (Mobile App)',
    dom_id: '#swagger-ui',
    deepLinking: true,
    filter: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    layout: 'StandaloneLayout'
  });
};`;

export function setupSwagger(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance() as express.Express;
  const customerDoc = buildOpenApiDocument('customer');
  const adminDoc = buildOpenApiDocument('admin');
  const allDoc = buildOpenApiDocument('all');

  server.get('/api/v1/docs/customer.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(customerDoc);
  });

  server.get('/api/v1/docs/admin.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(adminDoc);
  });

  server.get('/api/v1/docs/all.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(allDoc);
  });

  server.get('/api/v1/docs/swagger-init.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(SWAGGER_INIT_JS);
  });

  server.use(
    '/api/v1/docs/assets',
    express.static(getAbsoluteFSPath(), {
      index: false,
      maxAge: '1h',
    }),
  );

  server.get(['/api/v1/docs', '/api/v1/docs/'], (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(SWAGGER_HTML);
  });
}
