import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod';
import { Request, Response } from 'express';
export class ApiError extends HttpException {
  constructor(
    public code: string,
    status = 400,
    message = code,
    public details: unknown = null,
  ) {
    super(message, status);
  }
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiError(
      'VALIDATION_ERROR',
      400,
      'Request validation failed',
      r.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
    );
  return r.data;
}
export type Principal = { userId: string; sessionId: string };
export type ApiRequest = Request & { principal: Principal; requestId: string };
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<ApiRequest>();
    const res = http.getResponse<Response>();
    const pg = error as { code?: string; type?: string };
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : pg.type === 'entity.parse.failed'
          ? 400
          : pg.type === 'entity.too.large'
            ? 413
            : pg.code === '23505'
              ? 409
              : 500;
    res.status(status).json({
      code:
        error instanceof ApiError
          ? error.code
          : pg.code === '23505'
            ? 'CONFLICT'
            : status === 404
              ? 'NOT_FOUND'
              : status === 500
                ? 'INTERNAL_ERROR'
                : 'REQUEST_REJECTED',
      message:
        error instanceof ApiError
          ? error.message
          : status === 500
            ? 'Request could not be completed'
            : 'Request rejected',
      details: error instanceof ApiError ? error.details : null,
      requestId: req.requestId,
    });
  }
}
export const uuid = z.string().uuid();
export const token = z.string().min(20).max(2048);
export const password = z.string().min(12).max(128);
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const empty = z.object({}).strict();
