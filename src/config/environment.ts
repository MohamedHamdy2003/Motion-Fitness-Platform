import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('motion-api'),
  JWT_AUDIENCE: z.string().default('motion-mobile'),
  MAIL_MODE: z
    .enum(['disabled', 'capture', 'resend', 'smtp'])
    .default('disabled'),
  MAIL_ENCRYPTION_KEY: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default(''),
  RESET_LINK_BASE: z.string().default(''),
  VERIFY_LINK_BASE: z.string().default(''),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce
    .number()
    .int()
    .refine((v) => v === 465 || v === 587)
    .default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  APPLE_CLIENT_IDS: z.string().default(''),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''),
  APPLE_ENCRYPTION_KEY: z.string().default(''),
  AI_REWRITE_URL: z.string().default(''),
  AI_SERVICE_TOKEN: z.string().default(''),
  AI_RETENTION_APPROVED: z.enum(['true', 'false']).default('false'),
  DELETION_RETENTION_APPROVED: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
});
export type Environment = z.infer<typeof schema>;
export function environment(): Environment {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid configuration keys: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const env = result.data;
  if (
    env.NODE_ENV === 'production' &&
    (env.MAIL_MODE === 'capture' ||
      env.JWT_SECRET.includes('replace-with') ||
      env.DATABASE_SSL !== 'true')
  )
    throw new Error('Unsafe production configuration');
  for (const name of ['MAIL_ENCRYPTION_KEY', 'APPLE_ENCRYPTION_KEY'] as const)
    if (env[name] && !/^[a-f0-9]{64}$/i.test(env[name]))
      throw new Error(`Invalid ${name}`);
  if (env.MAIL_MODE !== 'disabled' && !env.MAIL_ENCRYPTION_KEY)
    throw new Error('MAIL_ENCRYPTION_KEY required');
  if (
    env.MAIL_MODE === 'resend' &&
    (!env.RESEND_API_KEY ||
      !env.MAIL_FROM ||
      !env.RESET_LINK_BASE ||
      !env.VERIFY_LINK_BASE)
  )
    throw new Error('Mail delivery configuration incomplete');
  if (
    env.MAIL_MODE === 'smtp' &&
    (!env.SMTP_USER ||
      !env.SMTP_PASSWORD ||
      !env.MAIL_FROM ||
      !env.RESET_LINK_BASE ||
      !env.VERIFY_LINK_BASE)
  )
    throw new Error('SMTP configuration incomplete');
  return env;
}
