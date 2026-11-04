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
    message = apiErrorMessages[code] || code,
    public details: unknown = null,
  ) {
    super(message, status);
  }
}
const apiErrorMessages: Record<string, string> = {
  UNAUTHENTICATED: 'Please sign in to continue.',
  EMAIL_NOT_VERIFIED: 'Please verify your email before accessing Motion.',
  SESSION_REVOKED: 'This session is no longer active. Please sign in again.',
  INVALID_REFRESH_TOKEN: 'Refresh token is invalid or expired.',
  INVALID_OR_EXPIRED_OTP: 'Verification code is invalid or expired.',
  INVALID_RESET_TOKEN: 'Password reset token is invalid or expired.',
  PASSWORD_LOGIN_NOT_ENABLED:
    'Password sign-in is not enabled for this account.',
  PASSWORDS_DO_NOT_MATCH: 'New password and confirmation do not match.',
  FRESH_REAUTHENTICATION_REQUIRED:
    'Please verify your identity again to continue.',
  INVALID_PROVIDER_TOKEN: 'The identity provider token is invalid or expired.',
  INVALID_OR_REUSED_CHALLENGE:
    'The sign-in challenge is invalid, expired, or already used.',
  GOOGLE_NOT_CONFIGURED: 'Google sign-in is not configured on this server.',
  APPLE_NOT_CONFIGURED: 'Apple sign-in is not configured on this server.',
  PROVIDER_UNAVAILABLE:
    'The sign-in provider is temporarily unavailable. Please try again later.',
  APPLE_CODE_EXCHANGE_FAILED:
    'Unable to verify the Apple sign-in authorization code.',
  ACCOUNT_UNAVAILABLE: 'This account is not available.',
  ACCOUNT_LINK_REQUIRED:
    'An account already uses this email. Sign in to it and link the provider.',
  IDENTITY_NOT_LINKED: 'This identity is not linked to your account.',
  APPLE_REVOCATION_FAILED:
    'The Apple authorization could not be revoked. Please try again later.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  REVISION_CONFLICT:
    'This item changed since you loaded it. Refresh and try again.',
  ALREADY_PUBLISHED: 'This version is already published.',
  CONTENT_ARCHIVED: 'This item is archived and cannot be changed.',
  FOOD_VERSION_NOT_FOUND: 'The selected food version does not exist.',
  FOOD_SECTION_NEEDS_ALTERNATIVES:
    'Publish a food section only after adding at least two alternatives.',
  FOOD_SECTION_FOOD_NOT_PUBLISHED:
    'Every food in the section must be published first.',
  FOOD_SECTION_MEMBER_NOT_FOUND:
    'The selected food section member does not exist.',
  MEAL_SECTION_UNAVAILABLE:
    'The selected meal section does not exist or is archived.',
  MEAL_NEEDS_ITEMS: 'Add at least one food item before publishing the meal.',
  MEAL_ITEM_NOT_PUBLISHED:
    'Every meal item must use a published food section and food.',
};
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiError(
      'VALIDATION_ERROR',
      400,
      r.error.issues[0]?.message || 'Please check the request fields.',
      r.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
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
    const pg = error as { code?: string; type?: string; constraint?: string };
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
          : pg.code === '23505' &&
              pg.constraint === 'users_email_normalized_key'
            ? 'EMAIL_ALREADY_REGISTERED'
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
          : pg.code === '23505' &&
              pg.constraint === 'users_email_normalized_key'
            ? 'Email already registered'
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
// Existing passwords remain accepted for sign-in. New/changed passwords use
// the stronger policy below.
export const password = z
  .string({ error: 'Password is required.' })
  .min(1, { error: 'Password is required.' })
  .max(128, { error: 'Password must be 128 characters or fewer.' });
export const newPassword = z
  .string({ error: 'Password is required.' })
  .min(8, { error: 'Password must be at least 8 characters.' })
  .max(128, { error: 'Password must be 128 characters or fewer.' })
  .regex(/[0-9]/, { error: 'Password must include at least one number.' })
  .regex(/[^\p{L}\p{N}\s]/u, {
    error: 'Password must include at least one symbol.',
  });
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const empty = z.object({}).strict();
