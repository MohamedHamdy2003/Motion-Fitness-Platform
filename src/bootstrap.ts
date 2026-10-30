import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import express from 'express';
import { AppModule } from './app.module';
import { ErrorFilter, ApiRequest } from './common/http';
import { environment } from './config/environment';
export async function createApp() {
  const e = environment();
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bodyParser: false,
  });
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  if (e.TRUST_PROXY === 'true') server.set('trust proxy', 1);
  app.use(
    (req: ApiRequest, res: express.Response, next: express.NextFunction) => {
      req.requestId = randomUUID();
      res.setHeader('x-request-id', req.requestId);
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.useGlobalFilters(new ErrorFilter());
  app.setGlobalPrefix('api/v1');
  const origins = e.CORS_ORIGINS.split(',').filter(Boolean);
  if (origins.length)
    app.enableCors({
      origin: origins,
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'X-Deletion-Token',
      ],
      exposedHeaders: ['X-Request-Id'],
    });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
