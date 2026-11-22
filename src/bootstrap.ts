import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import express from 'express';
import { AppModule } from './app.module';
import { ApiError, ErrorFilter, ApiRequest } from './common/http';
import { hash } from './common/crypto';
import { environment } from './config/environment';
import { setupSwagger } from './infrastructure/swagger/setup-swagger';

interface EdgeBucket {
  count: number;
  resetAt: number;
}

export async function createApp() {
  const e = environment();
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bodyParser: false,
  });
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  if (e.TRUST_PROXY === 'true') server.set('trust proxy', 1);

  const edgeBuckets = new Map<string, EdgeBucket>();
  const windowSeconds = 60;
  const maxRequestsPerWindow = Number(
    process.env.API_RATE_LIMIT_PER_MINUTE || 600,
  );

  app.use(
    (req: ApiRequest, res: express.Response, next: express.NextFunction) => {
      req.requestId = randomUUID();
      res.setHeader('x-request-id', req.requestId);
      res.setHeader('Cache-Control', 'no-store');

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (edgeBuckets.size > 5000) {
        for (const [key, b] of edgeBuckets) {
          if (b.resetAt <= nowSeconds) edgeBuckets.delete(key);
        }
      }
      const authHeader = req.headers.authorization;
      const clientKey = hash(
        authHeader ? `auth:${authHeader}` : `ip:${req.ip || 'local'}`,
      );
      let bucket = edgeBuckets.get(clientKey);
      if (!bucket || bucket.resetAt <= nowSeconds) {
        bucket = { count: 0, resetAt: nowSeconds + windowSeconds };
        edgeBuckets.set(clientKey, bucket);
      }
      bucket.count += 1;
      const remaining = Math.max(0, maxRequestsPerWindow - bucket.count);
      res.setHeader('X-RateLimit-Limit', String(maxRequestsPerWindow));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(bucket.resetAt));

      if (bucket.count > maxRequestsPerWindow) {
        const retryAfter = Math.max(1, bucket.resetAt - nowSeconds);
        res.setHeader('Retry-After', String(retryAfter));
        next(
          new ApiError('RATE_LIMITED', 429, undefined, null, {
            limit: maxRequestsPerWindow,
            remaining: 0,
            resetAt: bucket.resetAt,
            retryAfterSeconds: retryAfter,
          }),
        );
        return;
      }
      next();
    },
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.useGlobalFilters(new ErrorFilter());
  app.setGlobalPrefix('api/v1');
  setupSwagger(app);
  const origins = e.CORS_ORIGINS.split(',').filter(Boolean);
  if (origins.length)
    app.enableCors({
      origin: origins,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Deletion-Token'],
      exposedHeaders: [
        'X-Request-Id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
      ],
    });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
