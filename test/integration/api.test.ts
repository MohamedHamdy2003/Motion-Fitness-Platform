import 'reflect-metadata';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { decrypt, hash } from '../../src/common/crypto';
import {
  seedLookups,
  seedContent,
} from '../../src/infrastructure/database/seeds/seed-runner';
let app: INestApplication;
let db: DataSource;
let api: ReturnType<typeof request>;
const password = 'Motion-test-password-123';
const prefix = '/api/v1';
const registerUnverified = async (email = 'athlete@example.test') => {
  const r = await api.post(prefix + '/auth/register').send({ email, password });
  expect(r.status, r.text).toBe(201);
  return r.body;
};
const register = async (email = 'athlete@example.test') => {
  const created = await registerUnverified(email);
  const code = await capturedToken(email, true);
  const verification = await api
    .post(prefix + '/auth/verify-email')
    .send({ email, code });
  expect(verification.status, verification.text).toBe(200);
  const login = await api
    .post(prefix + '/auth/login')
    .send({ email, password });
  expect(login.status, login.text).toBe(200);
  return { ...created, ...login.body };
};
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
async function capturedToken(email: string, raw = false) {
  const [r] = await db.query(
    `SELECT j.payload FROM jobs j JOIN users u ON u.id=j.user_id WHERE u.email_normalized=$1 ORDER BY j.created_at DESC LIMIT 1`,
    [email],
  );
  const mail = JSON.parse(
    decrypt(r.payload.encrypted, process.env.MAIL_ENCRYPTION_KEY!),
  );
  const code = mail.text.match(/\b\d{6}\b/)![0];
  if (!raw && mail.subject.includes('Reset')) {
    const response = await api
      .post(prefix + '/auth/verify-reset-code')
      .send({ email, code });
    expect(response.status, response.text).toBe(200);
    return response.body.resetToken;
  }
  return code;
}
beforeAll(async () => {
  const url =
    process.env.TEST_DATABASE_URL ||
    'postgres://motion:motion_local_only@localhost:55432/motion_test';
  if (!new URL(url).pathname.endsWith('_test'))
    throw Error('Integration tests require a dedicated *_test database');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: url,
    DATABASE_SSL: 'false',
    JWT_SECRET: randomBytes(48).toString('hex'),
    MAIL_MODE: 'capture',
    MAIL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_IDS: '',
    APPLE_CLIENT_IDS: '',
    AI_REWRITE_URL: '',
    AI_RETENTION_APPROVED: 'false',
    DELETION_RETENTION_APPROVED: 'false',
  });
  const { databaseOptions } =
    await import('../../src/infrastructure/database/database.options.js');
  db = new DataSource(databaseOptions());
  await db.initialize();
  await db.runMigrations();
  // Dedicated *_test DB: clear published program fixtures before exercising historical rollback migrations.
  await db.query('TRUNCATE users,programs,nutrition_plans CASCADE');
  const migrations = await db.query('SELECT id FROM migrations');
  for (const ignored of migrations) {
    void ignored;
    await db.undoLastMigration();
  }
  await db.runMigrations();
  await seedLookups(db);
  const { createApp } = await import('../../src/bootstrap.js');
  app = await createApp();
  api = request(app.getHttpServer());
});
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await db.query(
    `TRUNCATE users CASCADE; TRUNCATE account_deletions,rate_limits,ai_usage_logs,uptime_checks; TRUNCATE matching_rulesets CASCADE;`,
  );
  Object.assign(process.env, {
    GOOGLE_CLIENT_IDS: '',
    MAIL_MODE: 'capture',
    AI_REWRITE_URL: '',
    AI_RETENTION_APPROVED: 'false',
    DELETION_RETENTION_APPROVED: 'false',
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  if (db?.isInitialized) await db.destroy();
});
describe('foundation against PostgreSQL', () => {
  it('removes legacy body-fat data while preserving weight rows and enforcing required weight', async () => {
    const user = await register();
    const { RemoveBodyFat1793404800000 } =
      await import('../../src/infrastructure/database/migrations/1793404800000-RemoveBodyFat.js');
    const migration = new RemoveBodyFat1793404800000();
    const { CurrentProfileWeight1793404801000 } =
      await import('../../src/infrastructure/database/migrations/1793404801000-CurrentProfileWeight.js');
    const currentWeight = new CurrentProfileWeight1793404801000();
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await currentWeight.down(runner);
      await migration.down(runner);
      const mixedId = crypto.randomUUID();
      const removedId = crypto.randomUUID();
      await runner.query(
        `INSERT INTO body_measurements(id,user_id,measured_at,weight_kg,body_fat_percent,body_fat_method) VALUES($1,$3,now(),80,20,'BIA'),($2,$3,now(),NULL,21,'BIA')`,
        [mixedId, removedId, user.user.id],
      );
      await migration.up(runner);
      const rows = await runner.query(
        'SELECT * FROM body_measurements WHERE user_id=$1',
        [user.user.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(mixedId);
      expect(Number(rows[0].weight_kg)).toBe(80);
      expect(rows[0]).not.toHaveProperty('body_fat_percent');
      expect(rows[0]).not.toHaveProperty('body_fat_method');
      const [column] = await runner.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='body_measurements' AND column_name='weight_kg'`,
      );
      expect(column.is_nullable).toBe('NO');
      await runner.query(
        `INSERT INTO body_measurements(id,user_id,measured_at,weight_kg) VALUES($1,$2,'2020-01-01T00:00:00Z',90)`,
        [crypto.randomUUID(), user.user.id],
      );
      await currentWeight.up(runner);
      const [profile] = await runner.query(
        'SELECT weight_kg FROM user_profiles WHERE user_id=$1',
        [user.user.id],
      );
      expect(Number(profile.weight_kg)).toBe(80);
      expect(
        (
          await runner.query(
            "SELECT to_regclass('public.body_measurements') AS table_name",
          )
        )[0].table_name,
      ).toBeNull();
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  });
  it('returns bounded safe JSON errors for malformed and oversized request bodies', async () => {
    const malformed = await api
      .post(prefix + '/auth/login')
      .set('content-type', 'application/json')
      .send('{invalid JSON');
    expect(malformed.status, malformed.text).toBe(400);
    expect(malformed.body).toHaveProperty('requestId');
    expect(malformed.text).not.toContain('SyntaxError');
    const oversized = await api
      .post(prefix + '/auth/login')
      .send({ email: 'x'.repeat(2_000_000), password });
    expect(oversized.status, oversized.text).toBe(413);
    expect(oversized.body).toHaveProperty('requestId');
  });
  it('runs reversible migrations and transactional, idempotent lookup seeds', async () => {
    await seedLookups(db);
    const before = await db.query(
      'SELECT * FROM body_areas_injuries ORDER BY code',
    );
    await seedLookups(db);
    expect(
      await db.query('SELECT * FROM body_areas_injuries ORDER BY code'),
    ).toEqual(before);
    await seedContent(db);
    await seedContent(db);
    expect((await db.query('SELECT count(*)::int AS n FROM users'))[0].n).toBe(
      0,
    );
  });
  it('serves seeded onboarding, allergen, and injury-area lookups via GET', async () => {
    const account = await register();
    const headers = bearer(account.accessToken);
    const onboarding = await api
      .get(prefix + '/references/onboarding')
      .set(headers);
    expect(onboarding.status, onboarding.text).toBe(200);
    expect(
      onboarding.body.primary_goals.map((item: { code: string }) => item.code),
    ).toEqual([
      'FAT_LOSS',
      'STRENGTH_HYPERTROPHY',
      'GET_FIT_TONED',
      'IMPROVE_ENDURANCE',
    ]);
    expect(onboarding.body.training_days_per_week_count).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(
      onboarding.body.fitness_levels.map((item: { code: string }) => item.code),
    ).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
    expect(onboarding.body.genders).toEqual(['FEMALE', 'MALE']);

    const allergens = await api
      .get(prefix + '/references/allergens')
      .set(headers);
    expect(allergens.status, allergens.text).toBe(200);
    expect(
      allergens.body.items.map((item: { code: string }) => item.code),
    ).toContain('MILK');

    const areas = await api.get(prefix + '/references/body-areas').set(headers);
    expect(areas.status, areas.text).toBe(200);
    expect(
      areas.body.items.map((item: { code: string }) => item.code),
    ).toContain('KNEE');
    expect(
      (await db.query("SELECT to_regclass('public.body_areas') AS old_name"))[0]
        .old_name,
    ).toBeNull();
    expect(
      (
        await db.query(
          "SELECT to_regclass('public.body_areas_injuries') AS new_name",
        )
      )[0].new_name,
    ).toBe('body_areas_injuries');
  });
  it('serves readiness and safe errors with unique server request IDs', async () => {
    const r = await api.get(prefix + '/health/ready');
    expect(r.status).toBe(200);
    expect(r.body.dependencies.email).toBe('LOCAL_CAPTURE');
    const e = await api
      .get(prefix + '/me')
      .set('x-request-id', 'untrusted-value');
    expect(e.status).toBe(401);
    expect(e.body.code).toBe('UNAUTHENTICATED');
    expect(e.body.requestId).toBe(e.headers['x-request-id']);
    expect(e.body.requestId).not.toBe('untrusted-value');
    expect(e.body).toHaveProperty('details', null);
  });
});
describe('authentication and account security', () => {
  it('stores password and opaque tokens as hashes; verifies email once', async () => {
    await registerUnverified();
    const [u] = await db.query('SELECT * FROM users');
    expect(u.password_hash).not.toContain(password);
    expect(u.password_hash).toContain('$argon2id$');
    const value = await capturedToken('athlete@example.test', true);
    expect(
      (
        await api
          .post(prefix + '/auth/verify-email')
          .send({ email: 'athlete@example.test', code: value })
      ).status,
    ).toBe(200);
    const login = await api
      .post(prefix + '/auth/login')
      .send({ email: 'athlete@example.test', password });
    expect(login.status).toBe(200);
    expect(login.body.tokenType).toBe('Bearer');
    const [t] = await db.query('SELECT * FROM auth_refresh_tokens');
    expect(t.token_hash).toBe(hash(login.body.refreshToken));
    expect(
      (
        await api
          .post(prefix + '/auth/verify-email')
          .send({ email: 'athlete@example.test', code: value })
      ).status,
    ).toBe(400);
  });
  it('rotates refresh and commits replay revocation before returning 401', async () => {
    const r = await register();
    const next = await api
      .post(prefix + '/auth/refresh')
      .send({ refreshToken: r.refreshToken });
    expect(next.status).toBe(200);
    expect(next.body.refreshToken).not.toBe(r.refreshToken);
    const replay = await api
      .post(prefix + '/auth/refresh')
      .send({ refreshToken: r.refreshToken });
    expect(replay.status).toBe(401);
    expect(
      (await api.get(prefix + '/me').set(bearer(next.body.accessToken))).status,
    ).toBe(401);
    expect(
      (
        await api
          .post(prefix + '/auth/refresh')
          .send({ refreshToken: next.body.refreshToken })
      ).status,
    ).toBe(401);
  });
  it('serializes simultaneous refresh and revokes the winner on replay', async () => {
    const r = await register();
    const responses = await Promise.all([
      api.post(prefix + '/auth/refresh').send({ refreshToken: r.refreshToken }),
      api.post(prefix + '/auth/refresh').send({ refreshToken: r.refreshToken }),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 401]);
    expect(
      (
        await api
          .get(prefix + '/me')
          .set(
            bearer(responses.find((x) => x.status === 200)!.body.accessToken),
          )
      ).status,
    ).toBe(401);
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE parent_token_id IS NOT NULL',
        )
      )[0].n,
    ).toBe(1);
  });
  it('revokes access immediately on logout and rejects refresh as a Bearer token', async () => {
    const r = await register();
    expect(
      (await api.get(prefix + '/me').set(bearer(r.refreshToken))).status,
    ).toBe(401);
    expect(
      (
        await api
          .post(prefix + '/auth/logout')
          .set(bearer(r.accessToken))
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (await api.get(prefix + '/me').set(bearer(r.accessToken))).status,
    ).toBe(401);
  });
  it('rejects forged/expired/wrong-audience JWTs and unconfigured providers', async () => {
    const r = await register();
    const jwt = (await import('jsonwebtoken')).default;
    for (const value of [
      r.accessToken.slice(0, -10) + 'forged',
      jwt.sign({ sub: r.user.id, sid: 'bad' }, process.env.JWT_SECRET!, {
        issuer: 'motion-api',
        audience: 'wrong',
        expiresIn: 900,
      }),
      jwt.sign({ sub: r.user.id, sid: 'bad' }, process.env.JWT_SECRET!, {
        issuer: 'motion-api',
        audience: 'motion-mobile',
        expiresIn: -1,
      }),
    ])
      expect((await api.get(prefix + '/me').set(bearer(value))).status).toBe(
        401,
      );
    const social = await api
      .post(prefix + '/auth/google')
      .send({ idToken: 'x'.repeat(40), challengeId: crypto.randomUUID() });
    expect(social.status).toBe(503);
    expect(social.body.code).toBe('GOOGLE_NOT_CONFIGURED');
  });
  it('returns indistinguishable forgot responses; reset is single-use and revokes all sessions', async () => {
    const r = await register();
    const known = await api
      .post(prefix + '/auth/forgot-password')
      .send({ email: 'athlete@example.test' });
    const unknown = await api
      .post(prefix + '/auth/forgot-password')
      .send({ email: 'unknown@example.test' });
    expect(known.body).toEqual(unknown.body);
    const value = await capturedToken('athlete@example.test');
    const payload = {
      token: value,
      newPassword: 'A-new-password-123',
      confirmPassword: 'A-new-password-123',
    };
    expect(
      (await api.post(prefix + '/auth/reset-password').send(payload)).status,
    ).toBe(200);
    expect(
      (await api.post(prefix + '/auth/reset-password').send(payload)).status,
    ).toBe(400);
    expect(
      (await api.get(prefix + '/me').set(bearer(r.accessToken))).status,
    ).toBe(401);
    expect(
      (
        await api.post(prefix + '/auth/login').send({
          email: 'athlete@example.test',
          password: 'A-new-password-123',
        })
      ).status,
    ).toBe(200);
  });
  it('rejects expired reset and incorrect current password without changing credentials', async () => {
    const r = await register();
    await api
      .post(prefix + '/auth/forgot-password')
      .send({ email: 'athlete@example.test' });
    const value = await capturedToken('athlete@example.test');
    await db.query(
      `UPDATE verification_tokens SET expires_at=now()-interval '1 minute' WHERE purpose='PASSWORD_RESET'`,
    );
    expect(
      (
        await api.post(prefix + '/auth/reset-password').send({
          token: value,
          newPassword: 'A-new-password-123',
          confirmPassword: 'A-new-password-123',
        })
      ).body.code,
    ).toBe('INVALID_RESET_TOKEN');
    expect(
      (
        await api
          .post(prefix + '/auth/change-password')
          .set(bearer(r.accessToken))
          .send({
            currentPassword: 'incorrect-password',
            newPassword: 'A-new-password-123',
            confirmPassword: 'A-new-password-123',
          })
      ).status,
    ).toBe(401);
    expect(
      (await api.get(prefix + '/me').set(bearer(r.accessToken))).status,
    ).toBe(200);
  });
  it('changes password and revokes every device and outstanding reset', async () => {
    const r = await register();
    const other = await api
      .post(prefix + '/auth/login')
      .send({ email: 'athlete@example.test', password });
    await api
      .post(prefix + '/auth/forgot-password')
      .send({ email: 'athlete@example.test' });
    const value = await capturedToken('athlete@example.test');
    expect(
      (
        await api
          .post(prefix + '/auth/change-password')
          .set(bearer(r.accessToken))
          .send({
            currentPassword: password,
            newPassword: 'A-new-password-123',
            confirmPassword: 'A-new-password-123',
          })
      ).status,
    ).toBe(200);
    expect(
      (await api.get(prefix + '/me').set(bearer(other.body.accessToken)))
        .status,
    ).toBe(401);
    expect(
      (
        await api.post(prefix + '/auth/reset-password').send({
          token: value,
          newPassword: password,
          confirmPassword: password,
        })
      ).status,
    ).toBe(400);
  });
  it('does not claim email delivery when no provider/capture is configured', async () => {
    process.env.MAIL_MODE = 'disabled';
    const r = await api
      .post(prefix + '/auth/register')
      .send({ email: 'athlete@example.test', password });
    expect(r.status).toBe(503);
    expect((await db.query('SELECT count(*)::int AS n FROM users'))[0].n).toBe(
      0,
    );
  });
  it('requires fresh purpose-scoped deletion proof and tracks pending cleanup after session revocation', async () => {
    const r = await register();
    const proof = await api
      .post(prefix + '/auth/reauthenticate')
      .set(bearer(r.accessToken))
      .send({ method: 'PASSWORD', password, purpose: 'DELETE' });
    expect(proof.status, proof.text).toBe(200);
    const deletion = await api
      .post(prefix + '/me/account-deletion')
      .set(bearer(r.accessToken))
      .send({ reauthenticationToken: proof.body.reauthenticationToken });
    expect(deletion.status, deletion.text).toBe(202);
    expect(
      (await api.get(prefix + '/me').set(bearer(r.accessToken))).status,
    ).toBe(401);
    const status = await api
      .get(prefix + '/me/account-deletion')
      .set('x-deletion-token', deletion.body.trackingToken);
    expect(status.body.status).toBe('PENDING');
    expect(status.body).not.toHaveProperty('user_id');
    const { JobsService } =
      await import('../../src/infrastructure/jobs/jobs.service.js');
    await app.get(JobsService).processOne();
    expect(
      (
        await db.query(
          `SELECT last_error_code FROM jobs WHERE kind='ACCOUNT_DELETION'`,
        )
      )[0].last_error_code,
    ).toBe('DELETION_RETENTION_POLICY_NOT_APPROVED');
    process.env.DELETION_RETENTION_APPROVED = 'true';
    await db.query(
      `UPDATE jobs SET available_at=now() WHERE kind='ACCOUNT_DELETION'`,
    );
    await app.get(JobsService).processOne();
    expect(
      (
        await api
          .get(prefix + '/me/account-deletion')
          .set('x-deletion-token', deletion.body.trackingToken)
      ).body.status,
    ).toBe('COMPLETED');
    expect((await db.query('SELECT count(*)::int AS n FROM users'))[0].n).toBe(
      0,
    );
  });
  it('rate-limits repeated login by account and IP', async () => {
    for (let i = 0; i < 6; i++)
      expect(
        (
          await api
            .post(prefix + '/auth/login')
            .send({ email: 'unknown@example.test', password })
        ).status,
      ).toBe(401);
    expect(
      (
        await api
          .post(prefix + '/auth/login')
          .send({ email: 'unknown@example.test', password })
      ).status,
    ).toBe(429);
  });
});
describe('social adapter orchestration with verified-provider fixtures', () => {
  it('consumes nonce challenge once and never silently merges colliding email accounts', async () => {
    process.env.GOOGLE_CLIENT_IDS = 'fixture-client';
    const { SocialService } =
      await import('../../src/modules/auth/social.service.js');
    const service = app.get(SocialService);
    const challenge = await api
      .post(prefix + '/auth/challenges')
      .send({ provider: 'GOOGLE', purpose: 'SIGN_IN' });
    expect(challenge.status).toBe(201);
    vi.spyOn(service, 'verify').mockResolvedValue({
      sub: 'google-fixture-user',
      nonce: challenge.body.nonce,
      email: 'social@example.test',
      email_verified: true,
    });
    const input = {
      idToken: 'fixture-token-'.repeat(3),
      challengeId: challenge.body.challengeId,
    };
    const first = await api.post(prefix + '/auth/google').send(input);
    expect(first.status, first.text).toBe(200);
    expect(
      (await api.post(prefix + '/auth/google').send(input)).body.code,
    ).toBe('INVALID_OR_REUSED_CHALLENGE');
    await register();
    const collision = await api
      .post(prefix + '/auth/challenges')
      .send({ provider: 'GOOGLE', purpose: 'SIGN_IN' });
    vi.mocked(service.verify).mockResolvedValue({
      sub: 'unlinked-collision',
      nonce: collision.body.nonce,
      email: 'athlete@example.test',
      email_verified: true,
    });
    const response = await api
      .post(prefix + '/auth/google')
      .send({ ...input, challengeId: collision.body.challengeId });
    expect(response.body.code).toBe('ACCOUNT_LINK_REQUIRED');
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM auth_identities WHERE provider_subject='unlinked-collision'`,
        )
      )[0].n,
    ).toBe(0);
  });
  it('binds linking to a fresh single-use LINK proof and refuses another account identity', async () => {
    process.env.GOOGLE_CLIENT_IDS = 'fixture-client';
    const user = await register();
    const second = await register('second@example.test');
    const { SocialService } =
      await import('../../src/modules/auth/social.service.js');
    const service = app.get(SocialService);
    const challenge = await api
      .post(prefix + '/auth/challenges')
      .set(bearer(user.accessToken))
      .send({ provider: 'GOOGLE', purpose: 'LINK' });
    vi.spyOn(service, 'verify').mockResolvedValue({
      sub: 'shared-subject',
      nonce: challenge.body.nonce,
      email: 'athlete@example.test',
      email_verified: true,
    });
    const proof = await api
      .post(prefix + '/auth/reauthenticate')
      .set(bearer(user.accessToken))
      .send({ method: 'PASSWORD', password, purpose: 'LINK' });
    const input = {
      idToken: 'fixture-token-'.repeat(3),
      challengeId: challenge.body.challengeId,
      reauthenticationToken: proof.body.reauthenticationToken,
    };
    expect(
      (
        await api
          .post(prefix + '/auth/identities/google/link')
          .set(bearer(user.accessToken))
          .send(input)
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .post(prefix + '/auth/identities/google/link')
          .set(bearer(user.accessToken))
          .send(input)
      ).body.code,
    ).toBe('FRESH_REAUTHENTICATION_REQUIRED');
    const otherChallenge = await api
      .post(prefix + '/auth/challenges')
      .set(bearer(second.accessToken))
      .send({ provider: 'GOOGLE', purpose: 'LINK' });
    vi.mocked(service.verify).mockResolvedValue({
      sub: 'shared-subject',
      nonce: otherChallenge.body.nonce,
    });
    const otherProof = await api
      .post(prefix + '/auth/reauthenticate')
      .set(bearer(second.accessToken))
      .send({ method: 'PASSWORD', password, purpose: 'LINK' });
    expect(
      (
        await api
          .post(prefix + '/auth/identities/google/link')
          .set(bearer(second.accessToken))
          .send({
            ...input,
            challengeId: otherChallenge.body.challengeId,
            reauthenticationToken: otherProof.body.reauthenticationToken,
          })
      ).status,
    ).toBe(409);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM auth_identities'))[0].n,
    ).toBe(1);
  });
  it('does not reset a social-only account into a local password account', async () => {
    const user = await register();
    await db.query('UPDATE users SET password_hash=NULL WHERE id=$1', [
      user.user.id,
    ]);
    const before = await db.query(
      `SELECT id FROM verification_tokens WHERE purpose='PASSWORD_RESET'`,
    );
    expect(
      (
        await api
          .post(prefix + '/auth/forgot-password')
          .send({ email: 'athlete@example.test' })
      ).status,
    ).toBe(202);
    expect(
      await db.query(
        `SELECT id FROM verification_tokens WHERE purpose='PASSWORD_RESET'`,
      ),
    ).toEqual(before);
    expect(
      (
        await api
          .post(prefix + '/auth/change-password')
          .set(bearer(user.accessToken))
          .send({
            currentPassword: password,
            newPassword: password,
            confirmPassword: password,
          })
      ).body.code,
    ).toBe('PASSWORD_LOGIN_NOT_ENABLED');
  });
});
describe('external adapter boundaries with fixture transports', () => {
  it('sends queued mail through TLS SMTP and retries failures without persisting message contents in errors', async () => {
    const smtp = (await import('nodemailer')).default;
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'fixture' });
    const create = vi
      .spyOn(smtp, 'createTransport')
      .mockReturnValue({ sendMail } as any);
    Object.assign(process.env, {
      MAIL_MODE: 'smtp',
      SMTP_USER: 'sender@example.test',
      SMTP_PASSWORD: 'fixture-app-password',
      MAIL_FROM: 'sender@example.test',
    });
    await register();
    const { JobsService } =
      await import('../../src/infrastructure/jobs/jobs.service.js');
    const jobs = app.get(JobsService);
    await jobs.processOne();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        requireTLS: true,
        logger: false,
        debug: false,
      }),
    );
    expect(sendMail).toHaveBeenCalledOnce();
    const [done] = await db.query(
      `SELECT payload,completed_at FROM jobs WHERE kind='MAIL'`,
    );
    expect(done.completed_at).not.toBeNull();
    expect(done.payload).toEqual({});
    await api
      .post(prefix + '/auth/forgot-password')
      .send({ email: 'athlete@example.test' });
    sendMail.mockRejectedValue(new Error('PRIVATE CONTENT MUST NOT APPEAR'));
    await jobs.processOne();
    const [failed] = await db.query(
      `SELECT last_error_code,payload FROM jobs WHERE completed_at IS NULL`,
    );
    expect(failed.last_error_code).toBe('EXTERNAL_OPERATION_FAILED');
    expect(JSON.stringify(failed)).not.toContain('PRIVATE CONTENT');
  });
  it('finalizes avatar bytes into an immutable owned key and rejects a different user', async () => {
    const user = await register();
    const other = await register('other@example.test');
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO media_assets(id,owner_user_id,storage_key,upload_key,mime,size,status) VALUES($1,$2,'uploads/fixture','uploads/fixture','image/png',16,'PENDING')`,
      [id, user.user.id],
    );
    const { MediaService } =
      await import('../../src/modules/media/media.service.js');
    const media = app.get(MediaService);
    const commands: any[] = [];
    const send = vi.fn(async (command: any) => {
      commands.push(command);
      if (command.constructor.name === 'HeadObjectCommand')
        return {
          ContentLength: 16,
          ContentType: 'image/png',
          ETag: '"fixture-etag"',
        };
      if (command.constructor.name === 'GetObjectCommand')
        return {
          Body: {
            transformToByteArray: async () =>
              Buffer.from('89504e470d0a1a0a0000000000000000', 'hex'),
          },
        };
      return {};
    });
    vi.spyOn(media, 'client').mockReturnValue({ send } as any);
    expect(
      (
        await api
          .post(prefix + '/media/' + id + '/finalize')
          .set(bearer(other.accessToken))
          .send({})
      ).status,
    ).toBe(404);
    const response = await api
      .post(prefix + '/media/' + id + '/finalize')
      .set(bearer(user.accessToken))
      .send({});
    expect(response.status, response.text).toBe(201);
    const [stored] = await db.query('SELECT * FROM media_assets WHERE id=$1', [
      id,
    ]);
    expect(stored.status).toBe('READY');
    expect(stored.storage_key).toContain('avatars/' + user.user.id + '/');
    expect(stored.storage_key).not.toBe(stored.upload_key);
    expect(
      commands.find((c) => c.constructor.name === 'CopyObjectCommand').input
        .CopySourceIfMatch,
    ).toBe('"fixture-etag"');
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(bearer(other.accessToken))
          .send({ avatar_media_id: id })
      ).body.code,
    ).toBe('INVALID_AVATAR');
  });
  it('rejects mismatched image content before marking an avatar ready', async () => {
    const user = await register();
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO media_assets(id,owner_user_id,storage_key,upload_key,mime,size,status) VALUES($1,$2,'uploads/wrong','uploads/wrong','image/png',16,'PENDING')`,
      [id, user.user.id],
    );
    const { MediaService } =
      await import('../../src/modules/media/media.service.js');
    const media = app.get(MediaService);
    vi.spyOn(media, 'client').mockReturnValue({
      send: vi.fn(async (command: any) =>
        command.constructor.name === 'HeadObjectCommand'
          ? { ContentLength: 16, ContentType: 'image/png', ETag: '"fixture"' }
          : {
              Body: {
                transformToByteArray: async () =>
                  Buffer.from('this is not a PNG'),
              },
            },
      ),
    } as any);
    const response = await api
      .post(prefix + '/media/' + id + '/finalize')
      .set(bearer(user.accessToken))
      .send({});
    expect(response.body.code).toBe('UPLOAD_CONTENT_TYPE_MISMATCH');
    expect(
      (await db.query('SELECT status FROM media_assets WHERE id=$1', [id]))[0]
        .status,
    ).toBe('PENDING');
  });
  it('fences an expired deletion worker before relational data removal', async () => {
    const user = await register();
    const { JobsService } =
      await import('../../src/infrastructure/jobs/jobs.service.js');
    const jobs = app.get(JobsService);
    process.env.DELETION_RETENTION_APPROVED = 'true';
    await db.query(`UPDATE users SET status='DELETION_PENDING' WHERE id=$1`, [
      user.user.id,
    ]);
    const jobId = crypto.randomUUID();
    const current = crypto.randomUUID();
    await db.query(
      `INSERT INTO jobs(id,kind,user_id,lease_token,lease_expires_at) VALUES($1,'ACCOUNT_DELETION',$2,$3,now()+interval '1 minute')`,
      [jobId, user.user.id, current],
    );
    await expect(
      jobs.erase(
        { id: jobId, user_id: user.user.id, attempts: 1 },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(
      (await db.query('SELECT id FROM users WHERE id=$1', [user.user.id]))
        .length,
    ).toBe(1);
  });
});
describe('profiles, onboarding and injuries', () => {
  it('does not bypass an approved minimum age through profile edits', async () => {
    const user = await register();
    const r = await api
      .patch(prefix + '/me')
      .set(bearer(user.accessToken))
      .send({ date_of_birth: '2020-01-01' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('AGE_NOT_ELIGIBLE');
    expect(
      (await db.query('SELECT profile_revision FROM user_profiles'))[0]
        .profile_revision,
    ).toBe(0);
  });
  it('onboards using current weight without a measurement date and keeps matching honest', async () => {
    const r = await register();
    const input = {
      name: 'Athlete',
      gender: 'FEMALE',
      height_cm: 175,
      primary_goal: 'GET_FIT_TONED',
      fitness_level: 'BEGINNER',
      training_days_per_week: [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'SATURDAY',
      ],
      timezone: 'Africa/Cairo',
      locale: 'ar',
      date_of_birth: '1998-03-14',
      weight_kg: 80,
      target_weight_kg: 72,
      food_preferences: {
        allergen_codes: [],
        disliked_food_ids: [],
      },
    };
    const first = await api
      .put(prefix + '/me/onboarding')
      .set(bearer(r.accessToken))
      .send(input);
    expect(first.status, first.text).toBe(200);
    expect(first.body.matching.status).toBe('CONFIGURATION_REQUIRED');
    expect(first.body).not.toHaveProperty('profile_revision');
    const profile = await api.get(prefix + '/me').set(bearer(r.accessToken));
    expect(profile.body.profile).toMatchObject({
      primary_goal: 'GET_FIT_TONED',
      training_days_per_week: input.training_days_per_week,
    });
    expect(
      (
        await api
          .put(prefix + '/me/onboarding')
          .set(bearer(r.accessToken))
          .send(input)
      ).status,
    ).toBe(200);
    const [saved] = await db.query(
      'SELECT weight_kg,gender,profile_revision FROM user_profiles WHERE user_id=$1',
      [r.user.id],
    );
    expect(Number(saved.weight_kg)).toBe(80);
    expect(saved.gender).toBe('FEMALE');
    expect(saved.profile_revision).toBe(2);
  });
  it('rejects profile lookup codes that are not seeded', async () => {
    const user = await register();
    const input = {
      name: 'Athlete',
      gender: 'FEMALE',
      height_cm: 175,
      weight_kg: 80,
      target_weight_kg: 72,
      primary_goal: 'UNREGISTERED_GOAL',
      fitness_level: 'BEGINNER',
      training_days_per_week: ['SUNDAY', 'TUESDAY'],
      timezone: 'Africa/Cairo',
      locale: 'ar',
      date_of_birth: '1998-03-14',
      food_preferences: {
        allergen_codes: [],
        disliked_food_ids: [],
      },
    };
    const response = await api
      .put(prefix + '/me/onboarding')
      .set(bearer(user.accessToken))
      .send(input);
    expect(response.status, response.text).toBe(422);
    expect(response.body.code).toBe('PRIMARY_GOAL_NOT_FOUND');
  });
  it('allows last successful profile write and rejects unauthorized fields', async () => {
    const r = await register();
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(bearer(r.accessToken))
          .send({ role: 'ADMIN' })
      ).status,
    ).toBe(400);
    const responses = await Promise.all([
      api
        .patch(prefix + '/me')
        .set(bearer(r.accessToken))
        .send({ name: 'First' }),
      api
        .patch(prefix + '/me')
        .set(bearer(r.accessToken))
        .send({ name: 'Second' }),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 200]);
  });
  it('replaces current weight without dates/history and rejects legacy fields', async () => {
    const user = await register();
    const headers = bearer(user.accessToken);
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(headers)
          .send({ weight_kg: 80 })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(headers)
          .send({ weight_kg: 81 })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(headers)
          .send({ weight_kg: 82 })
      ).status,
    ).toBe(200);
    for (const extra of [
      { measured_at: '2020-01-01T00:00:00Z' },
      { body_fat_percent: 21 },
      { initialMeasurement: { weight_kg: 83 } },
    ])
      expect(
        (
          await api
            .patch(prefix + '/me')
            .set(headers)
            .send({ weight_kg: 83, ...extra })
        ).status,
      ).toBe(400);
    const me = await api.get(prefix + '/me').set(headers);
    expect(Number(me.body.profile.weight_kg)).toBe(82);
    expect(me.body).not.toHaveProperty('latest_weight');
    expect(me.body).not.toHaveProperty('latest_body_fat');
    expect(me.body).not.toHaveProperty('measurement_freshness_policy_days');
    expect(me.body.profile).not.toHaveProperty('measured_at');
    expect(
      (await api.get(prefix + '/me/measurements').set(headers)).status,
    ).toBe(404);
    expect(
      (
        await api
          .post(prefix + '/me/measurements')
          .set(headers)
          .send({ weight_kg: 83 })
      ).status,
    ).toBe(404);
    const refs = await api.get(prefix + '/references/onboarding').set(headers);
    expect(refs.body).not.toHaveProperty('measurement_max_age_days');
    expect(refs.body.genders).toEqual(['FEMALE', 'MALE']);
  });
  it('requires explicit confirmation; prevents cross-user edits and allows last successful injury update', async () => {
    const r = await register();
    const other = await register('other@example.test');
    const input = {
      description: 'Final accepted knee description',
      body_area_code: 'KNEE',
      side: 'LEFT',
      confirmed: true,
    };
    expect(
      (
        await api
          .post(prefix + '/me/injuries')
          .set(bearer(r.accessToken))
          .send({ ...input, confirmed: false })
      ).status,
    ).toBe(400);
    const added = await api
      .post(prefix + '/me/injuries')
      .set(bearer(r.accessToken))
      .send(input);
    expect(added.status, added.text).toBe(201);
    const id = added.body.injury.id;
    expect(
      (
        await api
          .patch(prefix + '/me/injuries/' + id)
          .set(bearer(other.accessToken))
          .send({ ...input })
      ).status,
    ).toBe(404);
    const responses = await Promise.all([
      api
        .patch(prefix + '/me/injuries/' + id)
        .set(bearer(r.accessToken))
        .send({
          ...input,
          description: 'Edited final description A',
        }),
      api
        .patch(prefix + '/me/injuries/' + id)
        .set(bearer(r.accessToken))
        .send({
          ...input,
          description: 'Edited final description B',
        }),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 200]);
    expect(
      (
        await api
          .delete(prefix + '/me/injuries/' + id)
          .set(bearer(r.accessToken))
          .send({ confirmed: true })
      ).status,
    ).toBe(200);
    const me = await api.get(prefix + '/me').set(bearer(r.accessToken));
    expect(me.body.injuries).toEqual([]);
    expect(me.body.injury_revision).toBe(4);
  });
  it('preview failure saves nothing; successful preview stores metadata only and echoes form version', async () => {
    const r = await register();
    const input = {
      description: 'PRIVATE ORIGINAL DRAFT: my left knee hurts sometimes',
      body_area_code: 'KNEE',
      side: 'LEFT',
      draftVersion: 4,
    };
    expect(
      (
        await api
          .post(prefix + '/me/injuries/rewrite')
          .set(bearer(r.accessToken))
          .send(input)
      ).body.code,
    ).toBe('AI_REWRITE_NOT_CONFIGURED');
    process.env.AI_REWRITE_URL = 'http://private-fixture.test/rewrite';
    process.env.AI_SERVICE_TOKEN = 'private-fixture-token';
    process.env.AI_RETENTION_APPROVED = 'true';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            description:
              'PRIVATE UNCONFIRMED OUTPUT: I sometimes feel pain in my left knee.',
            modelVersion: 'fixture/model',
            instructionVersion: 'injury-rewrite-v1',
          }),
          { status: 200 },
        ),
      ),
    );
    const output = await api
      .post(prefix + '/me/injuries/rewrite')
      .set(bearer(r.accessToken))
      .send(input);
    expect(output.status, output.text).toBe(201);
    expect(output.body.draftVersion).toBe(4);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM user_injuries'))[0].n,
    ).toBe(0);
    const audit = JSON.stringify(
      await db.query('SELECT * FROM ai_rewrite_runs'),
    );
    expect(audit).not.toContain('PRIVATE');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })),
    );
    expect(
      (
        await api
          .post(prefix + '/me/injuries/rewrite')
          .set(bearer(r.accessToken))
          .send(input)
      ).status,
    ).toBe(503);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM user_injuries'))[0].n,
    ).toBe(0);
  });
  it('preferences validate references, reject removed exclusions and maintain an independent revision', async () => {
    const r = await register();
    const input = {
      allergen_codes: ['MILK'],
      disliked_food_ids: [],
    };
    const obsoleteField = await api
      .put(prefix + '/me/food-preferences')
      .set(bearer(r.accessToken))
      .send({ ...input, excluded_food_ids: [] });
    expect(obsoleteField.status).toBe(400);
    expect(
      (
        await api
          .put(prefix + '/me/food-preferences')
          .set(bearer(r.accessToken))
          .send({ ...input, allergen_codes: ['INVENTED'] })
      ).status,
    ).toBe(422);
    const saved = await api
      .put(prefix + '/me/food-preferences')
      .set(bearer(r.accessToken))
      .send(input);
    expect(saved.status, saved.text).toBe(200);
    expect(saved.body.revision).toBe(1);
    const replaced = await api
      .put(prefix + '/me/food-preferences')
      .set(bearer(r.accessToken))
      .send(input);
    expect(replaced.status, replaced.text).toBe(200);
    expect(replaced.body.revision).toBe(2);
    const me = await api.get(prefix + '/me').set(bearer(r.accessToken));
    expect(me.body.injury_revision).toBe(0);
    expect(me.body.food_preferences.allergen_codes).toEqual(['MILK']);
    expect(me.body.food_preferences).not.toHaveProperty('excluded_food_ids');
  });
  it('settings are updated and media fails honestly when storage is unavailable', async () => {
    const r = await register();
    expect(
      (
        await api
          .patch(prefix + '/me/settings')
          .set(bearer(r.accessToken))
          .send({
            theme: 'DARK',
            quiet_hours: { start: '22:00', end: '07:00' },
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch(prefix + '/me/settings')
          .set(bearer(r.accessToken))
          .send({ reminders: true })
      ).status,
    ).toBe(200);
    const upload = await api
      .post(prefix + '/media/upload-intents')
      .set(bearer(r.accessToken))
      .send({ mime: 'image/png', size: 123 });
    expect(upload.body.code).toBe('STORAGE_NOT_CONFIGURED');
  });
});

describe('F03 content library', () => {
  it('denies athletes and preserves published revisions while accepting simplified edits', async () => {
    const account = await register();
    const headers = bearer(account.accessToken);
    expect(
      (await api.get(prefix + '/admin/exercises').set(headers)).status,
    ).toBe(403);
    const [user] = await db.query(
      `SELECT id FROM users WHERE email_normalized='athlete@example.test'`,
    );
    await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.id]);
    const content = {
      title: 'Fixture exercise',
      description: 'Synthetic test only',
      instructions: ['Fixture instruction'],
      muscleGroups: ['fixture'],
      equipment: [],
      source: {
        title: 'Test fixture',
        reference: 'test-only',
        licenseNotes: 'Not production content',
      },
      mediaId: null,
    };
    const created = await api
      .post(prefix + '/admin/exercises')
      .set(headers)
      .send({ slug: 'fixture-exercise', content });
    expect(created.status, created.text).toBe(201);
    const id = created.body.exercise_id;
    const published = await api
      .post(prefix + `/admin/exercises/${id}/publish`)
      .set(headers)
      .send({});
    expect(published.status, published.text).toBe(201);
    expect(
      (
        await api
          .patch(prefix + `/admin/exercises/${id}`)
          .set(headers)
          .send({ content })
      ).status,
    ).toBe(200);
    const changed = await api
      .patch(prefix + `/admin/exercises/${id}`)
      .set(headers)
      .send({
        content: { ...content, title: 'New fixture' },
      });
    expect(changed.status, changed.text).toBe(200);
    const read = await api.get(prefix + `/admin/exercises/${id}`).set(headers);
    expect(read.body.versions).toHaveLength(2);
    expect(read.body.versions[0].content.title).toBe('New fixture');
    await expect(
      db.query(`UPDATE exercise_revisions SET content='{}' WHERE id=$1`, [
        created.body.id,
      ]),
    ).rejects.toThrow('Published content is immutable');
    await db.query(
      `DELETE FROM user_roles WHERE user_id=$1 AND role_code='ADMIN'`,
      [user.id],
    );
    expect(
      (await api.get(prefix + '/admin/exercises').set(headers)).status,
    ).toBe(403);
  });
  it('validates ingredient references and keeps unknown nutrients unknown', async () => {
    const account = await register();
    const headers = bearer(account.accessToken);
    const [user] = await db.query(
      `SELECT id FROM users WHERE email_normalized='athlete@example.test'`,
    );
    await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.id]);
    const ingredient = {
      title: 'Fixture ingredient',
      dietaryTags: [],
      allergenCodes: [],
      verificationStatus: 'UNKNOWN',
    };
    expect(
      (
        await api
          .post(prefix + '/admin/ingredients')
          .set(headers)
          .send({
            slug: 'invalid-fixture',
            content: { ...ingredient, allergenCodes: ['NOT_REAL'] },
          })
      ).status,
    ).toBe(422);
    const added = await api
      .post(prefix + '/admin/ingredients')
      .set(headers)
      .send({ slug: 'fixture-ingredient', content: ingredient });
    expect(added.status, added.text).toBe(201);
    const ingredientList = await api
      .get(prefix + '/admin/ingredients')
      .set(headers);
    expect(ingredientList.status, ingredientList.text).toBe(200);
    expect(ingredientList.body.map((row: { id: string }) => row.id)).toContain(
      added.body.id,
    );
    const ingredientDetails = await api
      .get(prefix + `/admin/ingredients/${added.body.id}`)
      .set(headers);
    expect(ingredientDetails.status, ingredientDetails.text).toBe(200);
    expect(ingredientDetails.body.id).toBe(added.body.id);
    const content = {
      title: 'Fixture food',
      preparation: 'Test only',
      preparationState: 'RAW',
      prepMinutes: 0,
      energyKcal100g: null,
      proteinG100g: null,
      carbohydrateG100g: null,
      fatG100g: null,
      fiberG100g: null,
      nutrientSource: {
        title: 'Fixture',
        reference: 'test-only',
        licenseNotes: 'Test only',
      },
      mediaId: null,
      ingredients: [{ ingredientId: added.body.id, quantityG: 100 }],
    };
    const food = await api
      .post(prefix + '/admin/foods')
      .set(headers)
      .send({ slug: 'fixture-food', content });
    expect(food.status, food.text).toBe(201);
    expect(food.body.content.energyKcal100g).toBeNull();
    expect(
      (
        await api
          .post(prefix + `/admin/foods/${food.body.food_id}/publish`)
          .set(headers)
          .send({})
      ).status,
    ).toBe(201);
  });
});

it('imports library drafts atomically and rejects changed seed versions', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { importLibrary } =
    await import('../../src/infrastructure/database/seeds/import-library.js');
  const dir = await mkdtemp(join(tmpdir(), 'motion-library-'));
  const path = join(dir, 'fixture.json');
  const manifest = {
    datasetId: 'test-fixture',
    version: 1,
    ingredients: [],
    foods: [],
    exercises: [
      {
        id: '799b670a-9afe-49aa-9ef7-63414d051ade',
        slug: 'seed-fixture',
        content: {
          title: 'Fixture',
          description: 'Test only',
          instructions: ['Test only'],
          muscleGroups: ['fixture'],
          equipment: [],
          source: {
            title: 'Fixture',
            reference: 'test-only',
            licenseNotes: 'Test only',
          },
          mediaId: null,
        },
      },
    ],
  };
  try {
    await writeFile(path, JSON.stringify(manifest));
    await importLibrary(db, path);
    await importLibrary(db, path);
    const rows = await db.query(
      `SELECT status FROM exercise_revisions WHERE exercise_id=$1`,
      [manifest.exercises[0].id],
    );
    expect(rows).toEqual([{ status: 'DRAFT' }]);
    manifest.exercises[0].content.title = 'Changed';
    await writeFile(path, JSON.stringify(manifest));
    await expect(importLibrary(db, path)).rejects.toThrow('different content');
    manifest.version = 2;
    manifest.exercises.unshift({
      ...manifest.exercises[0],
      id: '89f7d4a8-209c-4ca3-9afa-dd1d8e75583d',
      slug: 'rolled-back-fixture',
    });
    await writeFile(path, JSON.stringify(manifest));
    await expect(importLibrary(db, path)).rejects.toThrow();
    expect(
      await db.query(
        `SELECT id FROM exercises WHERE slug='rolled-back-fixture'`,
      ),
    ).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('seeds the USDA food and meal catalog as idempotent drafts', async () => {
  const { importLibrary } =
    await import('../../src/infrastructure/database/seeds/import-library.js');
  const { join } = await import('node:path');
  const dataPath = join(
    process.cwd(),
    'src/infrastructure/database/seeds/data/nutrition-library.v1.json',
  );
  await importLibrary(db, dataPath);
  await importLibrary(db, dataPath);
  expect(
    (
      await db.query(
        `SELECT count(*)::int AS n FROM foods WHERE slug IN ('chicken-breast-roasted','brown-rice-cooked','rolled-oats-dry','broccoli-cooked','hard-boiled-egg','sweet-potato-baked','banana-raw','plain-nonfat-greek-yogurt','canned-light-tuna','black-beans-cooked','lentils-cooked','quinoa-cooked','wild-atlantic-salmon-cooked','firm-tofu','potato-baked','spinach-cooked','carrots-cooked')`,
      )
    )[0].n,
  ).toBe(17);
  expect(
    (
      await db.query(
        `SELECT count(*)::int AS n FROM meal_versions WHERE meal_id IN (SELECT id FROM meals WHERE slug IN ('oats-yogurt-banana','egg-sweet-potato-spinach','chicken-rice-broccoli','salmon-quinoa-carrots','tuna-lentil-spinach-bowl','tofu-black-bean-rice-bowl')) AND status='DRAFT'`,
      )
    )[0].n,
  ).toBe(6);
  expect(
    (
      await db.query(
        `SELECT count(*)::int AS n FROM food_exchange_group_versions WHERE group_id IN (SELECT id FROM food_exchange_groups WHERE slug IN ('protein-options','carbohydrate-options','vegetable-options')) AND status='DRAFT'`,
      )
    )[0].n,
  ).toBe(3);
});

it('creates and publishes an admin food section and a meal from published foods', async () => {
  const user = await register();
  const headers = bearer(user.accessToken);
  await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.user.id]);
  const ingredient = await api
    .post(prefix + '/admin/ingredients')
    .set(headers)
    .send({
      slug: 'f08-fixture-ingredient',
      content: {
        title: 'F08 fixture ingredient',
        description: 'Ingredient details',
        dietaryTags: [],
        allergenCodes: [],
        verificationStatus: 'UNKNOWN',
      },
    });
  const foodContent = (title: string) => ({
    title,
    description: 'Food display details',
    preparation: 'Fixture preparation',
    preparationState: 'COOKED',
    prepMinutes: 0,
    energyKcal100g: 100,
    proteinG100g: 10,
    carbohydrateG100g: 10,
    fatG100g: 1,
    fiberG100g: 1,
    nutrientSource: {
      title: 'Fixture',
      reference: 'Test fixture',
      licenseNotes: 'Test only',
    },
    mediaId: null,
    ingredients: [{ ingredientId: ingredient.body.id, quantityG: 100 }],
  });
  const foodA = await api
    .post(prefix + '/admin/foods')
    .set(headers)
    .send({ slug: 'f08-food-one', content: foodContent('F08 food one') });
  const foodB = await api
    .post(prefix + '/admin/foods')
    .set(headers)
    .send({ slug: 'f08-food-two', content: foodContent('F08 food two') });
  expect(
    (await api.get(prefix + '/references/foods').set(headers)).body
      .contentStatus,
  ).toBe('CATALOG_NOT_SEEDED');
  for (const food of [foodA, foodB])
    expect(
      (
        await api
          .post(prefix + `/admin/foods/${food.body.food_id}/publish`)
          .set(headers)
          .send({})
      ).status,
    ).toBe(201);
  expect(
    (await api.get(prefix + '/references/foods').set(headers)).body
      .contentStatus,
  ).toBe('READY');
  const display = await api
    .get(prefix + '/references/foods?search=display%20details')
    .set(headers);
  expect(display.status).toBe(200);
  expect(display.body.items).toHaveLength(2);
  expect(display.body.items[0]).toMatchObject({
    kind: 'FOOD',
    description: 'Food display details',
  });
  const section = await api
    .post(prefix + '/admin/food-sections')
    .set(headers)
    .send({
      slug: 'f08-fixture-section',
      title: 'F08 fixture alternatives',
      members: [foodA, foodB].map((food) => ({
        foodVersionId: food.body.id,
        portionGPerUnit: 100,
        displayPortion: '100 g',
      })),
    });
  expect(section.status, section.text).toBe(201);
  const editedSection = await api
    .patch(prefix + `/admin/food-sections/${section.body.id}`)
    .set(headers)
    .send({
      title: 'Edited F08 fixture alternatives',
      members: [foodA, foodB].map((food) => ({
        foodVersionId: food.body.id,
        portionGPerUnit: 100,
        displayPortion: '100 g',
      })),
    });
  expect(editedSection.status, editedSection.text).toBe(200);
  const publishedSection = await api
    .post(prefix + `/admin/food-sections/${section.body.id}/publish`)
    .set(headers)
    .send({});
  expect(publishedSection.status, publishedSection.text).toBe(201);
  const members = await api
    .get(prefix + `/admin/food-sections/${section.body.id}`)
    .set(headers);
  const mealSection = await api
    .post(prefix + '/admin/meal-sections')
    .set(headers)
    .send({ slug: 'f08-fixture-meals', title: 'Fixture meals' });
  const meal = await api
    .post(prefix + '/admin/meals')
    .set(headers)
    .send({
      slug: 'f08-fixture-meal',
      sectionId: mealSection.body.id,
      title: 'Fixture meal',
      items: [
        {
          memberId: members.body.versions[0].members[0].id,
          exchangeUnits: 1,
          position: 0,
        },
      ],
    });
  expect(meal.status, meal.text).toBe(201);
  const editedMeal = await api
    .patch(prefix + `/admin/meals/${meal.body.id}`)
    .set(headers)
    .send({
      sectionId: mealSection.body.id,
      title: 'Edited fixture meal',
      items: [
        {
          memberId: members.body.versions[0].members[0].id,
          exchangeUnits: 1,
          position: 0,
        },
      ],
    });
  expect(editedMeal.status, editedMeal.text).toBe(200);
  expect(
    (
      await api
        .post(prefix + `/admin/meals/${meal.body.id}/publish`)
        .set(headers)
        .send({})
    ).status,
  ).toBe(201);
  expect(
    (await api.get(prefix + `/admin/meals/${meal.body.id}`).set(headers)).body
      .versions[0].items,
  ).toHaveLength(1);
});

it('saves an atomic paired program draft, publishes it, and versions later edits', async () => {
  const user = await register();
  const headers = bearer(user.accessToken);
  await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.user.id]);
  const exercise = await api
    .post(prefix + '/admin/exercises')
    .set(headers)
    .send({
      slug: 'f04-fixture-exercise',
      content: {
        title: 'F04 fixture exercise',
        description: 'Test only',
        instructions: ['Test instruction'],
        muscleGroups: ['fixture'],
        equipment: [],
        source: {
          title: 'Test fixture',
          reference: 'test-only',
          licenseNotes: 'Not production content',
        },
        mediaId: null,
      },
    });
  expect(exercise.status, exercise.text).toBe(201);
  expect(
    (
      await api
        .post(prefix + `/admin/exercises/${exercise.body.exercise_id}/publish`)
        .set(headers)
        .send({})
    ).status,
  ).toBe(201);
  const ingredient = await api
    .post(prefix + '/admin/ingredients')
    .set(headers)
    .send({
      slug: 'f04-fixture-ingredient',
      content: {
        title: 'F04 fixture ingredient',
        dietaryTags: [],
        allergenCodes: [],
        verificationStatus: 'UNKNOWN',
      },
    });
  const foodContent = (title: string) => ({
    title,
    description: 'Food display details',
    preparation: 'Fixture preparation',
    preparationState: 'COOKED',
    prepMinutes: 0,
    energyKcal100g: 100,
    proteinG100g: 10,
    carbohydrateG100g: 10,
    fatG100g: 1,
    fiberG100g: 1,
    nutrientSource: {
      title: 'Fixture',
      reference: 'Test fixture',
      licenseNotes: 'Test only',
    },
    mediaId: null,
    ingredients: [{ ingredientId: ingredient.body.id, quantityG: 100 }],
  });
  const foods = await Promise.all(
    ['one', 'two'].map((suffix) =>
      api
        .post(prefix + '/admin/foods')
        .set(headers)
        .send({
          slug: `f04-fixture-food-${suffix}`,
          content: foodContent(`F04 fixture food ${suffix}`),
        }),
    ),
  );
  for (const food of foods)
    expect(
      (
        await api
          .post(prefix + `/admin/foods/${food.body.food_id}/publish`)
          .set(headers)
          .send({})
      ).status,
    ).toBe(201);
  const section = await api
    .post(prefix + '/admin/food-sections')
    .set(headers)
    .send({
      slug: 'f04-fixture-food-section',
      title: 'F04 fixture alternatives',
      members: foods.map((food) => ({
        foodVersionId: food.body.id,
        portionGPerUnit: 100,
        displayPortion: '100 g',
      })),
    });
  expect(section.status, section.text).toBe(201);
  expect(
    (
      await api
        .post(prefix + `/admin/food-sections/${section.body.id}/publish`)
        .set(headers)
        .send({})
    ).status,
  ).toBe(201);
  const sectionDetail = await api
    .get(prefix + `/admin/food-sections/${section.body.id}`)
    .set(headers);
  const mealSection = await api
    .post(prefix + '/admin/meal-sections')
    .set(headers)
    .send({ slug: 'f04-fixture-meals', title: 'F04 fixture meals' });
  const meal = await api
    .post(prefix + '/admin/meals')
    .set(headers)
    .send({
      slug: 'f04-fixture-meal',
      sectionId: mealSection.body.id,
      title: 'F04 fixture meal',
      items: [
        {
          memberId: sectionDetail.body.versions[0].members[0].id,
          exchangeUnits: 1,
          position: 0,
        },
      ],
    });
  expect(meal.status, meal.text).toBe(201);
  expect(
    (
      await api
        .post(prefix + `/admin/meals/${meal.body.id}/publish`)
        .set(headers)
        .send({})
    ).status,
  ).toBe(201);
  const publishedMeal = await api
    .get(prefix + `/admin/meals/${meal.body.id}`)
    .set(headers);
  const mealVersionId = publishedMeal.body.versions[0].id;
  const exerciseRevisionId = exercise.body.id;
  const nutritionSlot = {
    mealType: 'LUNCH',
    localTime: '12:00',
    mealVersionId,
  };
  const weeks = Array.from({ length: 4 }, () => ({
    days: Array.from({ length: 7 }, (_, day) =>
      day === 0 || day === 3
        ? {
            kind: 'TRAINING' as const,
            workout: {
              title: 'Fixture workout',
              description: 'Fixture workout description',
              exercises: [
                {
                  exerciseRevisionId,
                  prescription: {
                    mode: 'REPS' as const,
                    setCount: 3,
                    repsMin: 8,
                    repsMax: 12,
                    restSeconds: 60,
                  },
                },
              ],
            },
            meals: [nutritionSlot],
          }
        : { kind: 'REST' as const, meals: [nutritionSlot] },
    ),
  }));
  const aggregate = {
    slug: 'f04-fixture-program',
    title: 'F04 fixture program',
    primaryGoal: 'STRENGTH_HYPERTROPHY',
    supportedGoals: ['STRENGTH_HYPERTROPHY'],
    idealLevel: 'BEGINNER',
    supportedLevels: ['BEGINNER'],
    trainingDaysPerWeek: 2,
    editorialPriority: 0,
    description: 'Program aggregate integration fixture.',
    requiredEquipment: [],
    intendedAudience: null,
    months: [{ title: 'Month one', weeks }],
  };
  const created = await api
    .post(prefix + '/admin/programs')
    .set(headers)
    .send(aggregate);
  expect(created.status, created.text).toBe(201);
  expect(created.body.months[0].weeks).toHaveLength(4);
  expect(
    created.body.months[0].weeks.flatMap(
      (week: { days: unknown[] }) => week.days,
    ),
  ).toHaveLength(28);
  expect(created.body.status).toBe('DRAFT');
  const hint = await api
    .post(prefix + `/admin/programs/${created.body.id}/hints`)
    .set(headers)
    .send({
      originalText: 'Test-only guidance for the fixture program.',
      structuredHints: { suitabilityNotes: ['Test only'] },
    });
  expect(hint.status, hint.text).toBe(201);
  const approvedHint = await api
    .post(
      prefix +
        `/admin/programs/${created.body.id}/hints/${hint.body.id}/approve`,
    )
    .set(headers)
    .send({});
  expect(approvedHint.status, approvedHint.text).toBe(201);
  const published = await api
    .post(prefix + `/admin/programs/${created.body.id}/publish`)
    .set(headers)
    .send({});
  expect(published.status, published.text).toBe(201);
  expect(published.body.status).toBe('PUBLISHED');
  const [pair] = await db.query(
    `SELECT pv.status AS program_status,npv.status AS nutrition_status,npv.duration_days FROM program_versions pv JOIN nutrition_plan_versions npv ON npv.id=pv.nutrition_plan_version_id WHERE pv.id=$1`,
    [created.body.version_id],
  );
  expect(pair).toEqual({
    program_status: 'PUBLISHED',
    nutrition_status: 'PUBLISHED',
    duration_days: 28,
  });
  const nextDraft = await api
    .patch(prefix + `/admin/programs/${created.body.id}`)
    .set(headers)
    .send({
      ...Object.fromEntries(
        Object.entries(aggregate).filter(([key]) => key !== 'slug'),
      ),
      title: 'Edited F04 fixture',
    });
  expect(nextDraft.status, nextDraft.text).toBe(200);
  expect(nextDraft.body.version).toBe(2);
  expect(nextDraft.body.status).toBe('DRAFT');
  await expect(
    db.query(
      'UPDATE monthly_plans SET program_version_id=$1,position=2 WHERE program_version_id=$2',
      [nextDraft.body.version_id, published.body.version_id],
    ),
  ).rejects.toThrow('Program structure cannot be moved between parents');
  await expect(
    db.query(
      'DELETE FROM program_version_supported_levels WHERE program_version_id=$1',
      [published.body.version_id],
    ),
  ).rejects.toThrow('Published program eligibility is immutable');
  expect(
    (await api.get(prefix + `/admin/programs/${created.body.id}`).set(headers))
      .body.title,
  ).toBe('Edited F04 fixture');

  await expect(
    db.query('UPDATE program_hint_versions SET approved_by=NULL WHERE id=$1', [
      hint.body.id,
    ]),
  ).rejects.toThrow('Approved program hint is immutable');

  const proof = await api
    .post(prefix + '/auth/reauthenticate')
    .set(headers)
    .send({ method: 'PASSWORD', password, purpose: 'DELETE' });
  expect(proof.status, proof.text).toBe(200);
  const deletion = await api
    .post(prefix + '/me/account-deletion')
    .set(headers)
    .send({ reauthenticationToken: proof.body.reauthenticationToken });
  expect(deletion.status, deletion.text).toBe(202);

  process.env.DELETION_RETENTION_APPROVED = 'true';
  const { JobsService } =
    await import('../../src/infrastructure/jobs/jobs.service.js');
  await app.get(JobsService).processOne();
  const deletionStatus = await api
    .get(prefix + '/me/account-deletion')
    .set('x-deletion-token', deletion.body.trackingToken);
  expect(deletionStatus.body.status).toBe('COMPLETED');
  expect(
    await db.query('SELECT id FROM users WHERE id=$1', [user.user.id]),
  ).toEqual([]);

  const [retained] = await db.query(
    `SELECT h.approved_by,h.approved_at,h.structured_hints,h.status,pv.approved_hint_version_id
     FROM program_hint_versions h JOIN program_versions pv ON pv.id=h.program_version_id
     WHERE h.id=$1`,
    [hint.body.id],
  );
  expect(retained).toMatchObject({
    approved_by: null,
    approved_hint_version_id: hint.body.id,
    status: 'APPROVED',
    structured_hints: approvedHint.body.structured_hints,
  });
  expect(new Date(retained.approved_at).toISOString()).toBe(
    approvedHint.body.approved_at,
  );
});

it('limits OTP guesses, expires codes and invalidates older codes on resend', async () => {
  await registerUnverified();
  const email = 'athlete@example.test';
  const original = await capturedToken(email, true);
  const wrong = original === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++)
    expect(
      (
        await api
          .post(prefix + '/auth/verify-email')
          .send({ email, code: wrong })
      ).status,
    ).toBe(400);
  expect(
    (
      await api
        .post(prefix + '/auth/verify-email')
        .send({ email, code: original })
    ).status,
  ).toBe(400);
  const [attempt] = await db.query(
    `SELECT attempts,consumed_at FROM verification_tokens WHERE purpose='EMAIL_VERIFICATION'`,
  );
  expect(attempt.attempts).toBe(5);
  expect(attempt.consumed_at).not.toBeNull();
  await db.query('TRUNCATE rate_limits');
  await db.query(
    `UPDATE verification_tokens SET expires_at=now()+interval '8 minutes' WHERE is_otp`,
  );
  await api.post(prefix + '/auth/resend-verification').send({ email });
  const fresh = await capturedToken(email, true);
  await db.query(
    `UPDATE verification_tokens SET expires_at=now()-interval '1 second' WHERE is_otp`,
  );
  expect(
    (await api.post(prefix + '/auth/verify-email').send({ email, code: fresh }))
      .status,
  ).toBe(400);
});
it('keeps OTP purposes separate and consumes a reset code only once', async () => {
  await registerUnverified();
  const email = 'athlete@example.test';
  const verify = await capturedToken(email, true);
  expect(
    (
      await api
        .post(prefix + '/auth/verify-reset-code')
        .send({ email, code: verify })
    ).status,
  ).toBe(400);
  await api.post(prefix + '/auth/forgot-password').send({ email });
  const code = await capturedToken(email, true);
  const results = await Promise.all(
    [1, 2].map(() =>
      api.post(prefix + '/auth/verify-reset-code').send({ email, code }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  expect(
    (
      await api
        .post(prefix + '/auth/reset-password')
        .send({ token: code, newPassword: password, confirmPassword: password })
    ).status,
  ).toBe(400);
});

it('does not send captured messages when switching to SMTP', async () => {
  await register();
  const smtp = (await import('nodemailer')).default;
  const sendMail = vi.fn();
  vi.spyOn(smtp, 'createTransport').mockReturnValue({ sendMail } as any);
  Object.assign(process.env, {
    MAIL_MODE: 'smtp',
    SMTP_USER: 'sender@example.test',
    SMTP_PASSWORD: 'fixture',
    MAIL_FROM: 'sender@example.test',
  });
  const { JobsService } =
    await import('../../src/infrastructure/jobs/jobs.service.js');
  expect(await app.get(JobsService).processOne()).toBe(false);
  expect(sendMail).not.toHaveBeenCalled();
});

it('keeps food drafts private and accepts serialized editorial writes', async () => {
  const user = await register();
  const headers = bearer(user.accessToken);
  await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.user.id]);
  const ing = await api
    .post(prefix + '/admin/ingredients')
    .set(headers)
    .send({
      slug: 'visibility-ingredient',
      content: {
        title: 'Visibility ingredient',
        dietaryTags: [],
        allergenCodes: [],
        verificationStatus: 'UNKNOWN',
      },
    });
  const content = {
    title: 'Visibility draft',
    preparation: 'Fixture only',
    preparationState: 'RAW',
    prepMinutes: 0,
    energyKcal100g: null,
    proteinG100g: null,
    carbohydrateG100g: null,
    fatG100g: null,
    fiberG100g: null,
    nutrientSource: {
      title: 'Fixture',
      reference: 'Test only',
      licenseNotes: 'Test only',
    },
    mediaId: null,
    ingredients: [{ ingredientId: ing.body.id, quantityG: 100 }],
  };
  const made = await api
    .post(prefix + '/admin/foods')
    .set(headers)
    .send({ slug: 'visibility-food', content });
  expect(made.status, made.text).toBe(201);
  expect(
    await db.query(`SELECT id FROM available_food_references WHERE id=$1`, [
      made.body.food_id,
    ]),
  ).toEqual([]);
  const edits = await Promise.all(
    [1, 2].map(() =>
      api
        .patch(prefix + '/admin/foods/' + made.body.food_id)
        .set(headers)
        .send({
          content: { ...content, title: 'Published fixture' },
        }),
    ),
  );
  expect(edits.map((r) => r.status).sort()).toEqual([200, 200]);
  expect(
    (
      await api
        .post(prefix + '/admin/foods/' + made.body.food_id + '/publish')
        .set(headers)
        .send({})
    ).status,
  ).toBe(201);
  expect(
    (
      await db.query(`SELECT name FROM available_food_references WHERE id=$1`, [
        made.body.food_id,
      ])
    )[0].name,
  ).toBe('Published fixture');
  await expect(
    db.query(`DELETE FROM food_ingredients WHERE food_version_id=$1`, [
      made.body.id,
    ]),
  ).rejects.toThrow('Published recipe is immutable');
  expect(
    (
      await api
        .delete(prefix + '/admin/foods/' + made.body.food_id)
        .set(headers)
        .send({})
    ).status,
  ).toBe(200);
  expect(
    await db.query(`SELECT id FROM available_food_references WHERE id=$1`, [
      made.body.food_id,
    ]),
  ).toEqual([]);
  expect(
    (
      await api
        .patch(prefix + '/admin/foods/' + made.body.food_id)
        .set(headers)
        .send({ content })
    ).body.code,
  ).toBe('CONTENT_ARCHIVED');
});
it('finalizes shared video atomically, protects referenced media and blocks athlete access', async () => {
  const user = await register();
  const headers = bearer(user.accessToken);
  await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.user.id]);
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO media_assets(id,owner_user_id,storage_key,upload_key,mime,size,status,library_asset) VALUES($1,$2,$3,$3,'video/mp4',16,'PENDING',true)`,
    [id, user.user.id, 'uploads/library/' + id],
  );
  const { MediaService } =
    await import('../../src/modules/media/media.service.js');
  const media = app.get(MediaService);
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const send = vi.fn(async (command: any) => {
    if (command.constructor.name === 'HeadObjectCommand')
      return { ContentLength: 16, ContentType: 'video/mp4', ETag: '"fixture"' };
    if (command.constructor.name === 'GetObjectCommand')
      return { Body: { transformToByteArray: async () => bytes } };
    return {};
  });
  vi.spyOn(media, 'client').mockReturnValue({ send } as any);
  expect(
    (await api.get(prefix + '/admin/media/' + id).set(headers)).body.status,
  ).toBe('PENDING');
  expect(
    (
      await api
        .post(prefix + '/media/' + id + '/finalize')
        .set(headers)
        .send({})
    ).status,
  ).toBe(404);
  bytes.write('avif', 8);
  expect(
    (
      await api
        .post(prefix + '/admin/media/' + id + '/finalize')
        .set(headers)
        .send({})
    ).body.code,
  ).toBe('UPLOAD_CONTENT_TYPE_MISMATCH');
  bytes.write('isom', 8);
  const finalized = await Promise.all(
    [1, 2].map(() =>
      api
        .post(prefix + '/admin/media/' + id + '/finalize')
        .set(headers)
        .send({}),
    ),
  );
  expect(finalized.map((r) => r.status)).toEqual([201, 201]);
  const [asset] = await db.query('SELECT * FROM media_assets WHERE id=$1', [
    id,
  ]);
  expect(asset.owner_user_id).toBeNull();
  expect(asset.storage_key.startsWith('library/')).toBe(true);
  expect((await api.get(prefix + '/media/' + id).set(headers)).status).toBe(
    404,
  );
  const content = {
    title: 'Video fixture',
    description: 'Test only',
    instructions: ['Test only'],
    muscleGroups: ['fixture'],
    equipment: [],
    source: {
      title: 'Fixture',
      reference: 'Test only',
      licenseNotes: 'Test only',
    },
    mediaId: id,
  };
  const exercise = await api
    .post(prefix + '/admin/exercises')
    .set(headers)
    .send({ slug: 'video-fixture', content });
  expect(exercise.status, exercise.text).toBe(201);
  expect(
    (
      await api
        .delete(prefix + '/admin/media/' + id)
        .set(headers)
        .send({})
    ).body.code,
  ).toBe('MEDIA_IN_USE');
  expect(
    (
      await api
        .patch(prefix + '/admin/exercises/' + exercise.body.exercise_id)
        .set(headers)
        .send({ content: { ...content, mediaId: null } })
    ).status,
  ).toBe(200);
  expect(
    (
      await api
        .delete(prefix + '/admin/media/' + id)
        .set(headers)
        .send({})
    ).status,
  ).toBe(200);
  expect(
    (await api.get(prefix + '/admin/media/' + id).set(headers)).status,
  ).toBe(404);
  expect(
    (
      await api
        .post(prefix + '/admin/media/' + id + '/finalize')
        .set(headers)
        .send({})
    ).status,
  ).toBe(404);
  await db.query(
    `DELETE FROM user_roles WHERE user_id=$1 AND role_code='ADMIN'`,
    [user.user.id],
  );
  expect((await api.get(prefix + '/admin/media').set(headers)).status).toBe(
    403,
  );
});

it('preserves ingredient descriptions when omitted and clears them only with explicit null', async () => {
  const user = await register();
  const headers = bearer(user.accessToken);
  await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.user.id]);
  const content = {
    title: 'Review ingredient',
    description: 'Keep these source details',
    dietaryTags: [],
    allergenCodes: [],
    verificationStatus: 'UNKNOWN',
  };
  const created = await api
    .post(prefix + '/admin/ingredients')
    .set(headers)
    .send({ slug: 'review-description', content });
  expect(created.status, created.text).toBe(201);
  const { description: omitted, ...withoutDescription } = content;
  const edited = await api
    .patch(prefix + '/admin/ingredients/' + created.body.id)
    .set(headers)
    .send({ content: { ...withoutDescription, title: 'Renamed ingredient' } });
  expect(edited.status, edited.text).toBe(200);
  expect(edited.body.description).toBe(omitted);
  const reference = await api
    .get(prefix + '/references/foods?search=Keep%20these%20source')
    .set(headers);
  expect(reference.body.items).toContainEqual(
    expect.objectContaining({
      id: created.body.id,
      name: 'Renamed ingredient',
      description: omitted,
    }),
  );
  const cleared = await api
    .patch(prefix + '/admin/ingredients/' + created.body.id)
    .set(headers)
    .send({ content: { ...withoutDescription, description: null } });
  expect(cleared.status, cleared.text).toBe(200);
  expect(cleared.body.description).toBeNull();
  const fetched = await api.get(
    prefix + '/references/ingredients/' + created.body.id,
  );
  expect(fetched.body.item.description).toBeNull();
});

describe('F05 program matching', () => {
  async function setup() {
    const user = await register();
    const headers = bearer(user.accessToken);
    await db.query(`INSERT INTO user_roles VALUES($1,'ADMIN')`, [user.user.id]);
    const rules = await api
      .post(prefix + '/admin/matching/rulesets')
      .set(headers)
      .send({
        instructionVersion: 'reviewed-v1',
        instructions:
          'Compare the supplied candidate descriptions and choose the best fit.',
        model: 'fixture/model',
      });
    expect(rules.status, rules.text).toBe(201);
    expect(
      (
        await api
          .post(
            prefix + '/admin/matching/rulesets/' + rules.body.id + '/publish',
          )
          .set(headers)
          .send({
            qualityApproved: true,
            evaluationReference: 'reviewed-fixture-set-v1',
          })
      ).status,
    ).toBe(201);
    await db.query(
      `UPDATE user_profiles SET name='Private name',gender='FEMALE',height_cm=175,weight_kg=80,target_weight_kg=72,primary_goal='FAT_LOSS',fitness_level='BEGINNER',training_days_per_week=2,
        training_weekdays=ARRAY[
          (ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'])[1+extract(dow FROM now() AT TIME ZONE 'UTC')::int],
          (ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'])[1+extract(dow FROM (now() AT TIME ZONE 'UTC')+interval '2 days')::int]
        ],date_of_birth='1998-03-14',onboarded_at=now() WHERE user_id=$1`,
      [user.user.id],
    );
    const { ProgramMatchingService } =
      await import('../../src/modules/matching/program-matching.service.js');
    const { PROGRAM_MATCHER } =
      await import('../../src/modules/matching/matching.contract.js');
    const matcher = app.get(PROGRAM_MATCHER);
    const service = app.get(ProgramMatchingService);
    return { user, headers, rules, matcher, service };
  }
  async function program(
    goal = 'FAT_LOSS',
    days = 2,
    level = 'BEGINNER',
    months = 1,
  ) {
    const id = crypto.randomUUID(),
      nutrition = crypto.randomUUID(),
      nv = crypto.randomUUID(),
      version = crypto.randomUUID();
    await db.query(
      `INSERT INTO programs(id,slug) VALUES($1::uuid,$1::uuid::text)`,
      [id],
    );
    await db.query(
      `INSERT INTO nutrition_plans(id,slug) VALUES($1::uuid,$1::uuid::text)`,
      [nutrition],
    );
    await db.query(
      `INSERT INTO nutrition_plan_versions(id,nutrition_plan_id,version,duration_days) VALUES($1,$2,1,$3)`,
      [nv, nutrition, months * 28],
    );
    await db.query(
      `INSERT INTO program_versions(id,program_id,version,title,primary_goal,ideal_level,training_days_per_week,description,nutrition_plan_version_id) VALUES($1,$2,1,'Candidate',$3,$4,$5,'Admin prepared program description',$6)`,
      [version, id, goal, level, days, nv],
    );
    await db.query(
      `INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code) VALUES($1,$2)`,
      [version, level],
    );
    await db.query(
      `INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code) VALUES($1,$2)`,
      [version, goal],
    );
    await db.query(
      `INSERT INTO nutrition_template_days(id,nutrition_plan_version_id,day_position)
       SELECT gen_random_uuid(),$1,n FROM generate_series(1,$2) n`,
      [nv, months * 28],
    );
    const exercise = crypto.randomUUID();
    const er = crypto.randomUUID();
    const workout = crypto.randomUUID();
    const wr = crypto.randomUUID();
    await db.query(
      'INSERT INTO exercises(id,slug) VALUES($1::uuid,$1::uuid::text)',
      [exercise],
    );
    await db.query(
      `INSERT INTO exercise_revisions(id,exercise_id,version,status,content)
       VALUES($1,$2,1,'PUBLISHED','{"title":"Fixture squat","description":"Fixture description","instructions":["Fixture instruction"],"muscleGroups":["Legs"],"equipment":[]}')`,
      [er, exercise],
    );
    await db.query(
      'INSERT INTO workouts(id,slug) VALUES($1::uuid,$1::uuid::text)',
      [workout],
    );
    await db.query(
      "INSERT INTO workout_revisions(id,workout_id,version,title,description) VALUES($1,$2,1,'Test workout','Fixture')",
      [wr, workout],
    );
    await db.query(
      `INSERT INTO workout_exercises(id,workout_revision_id,exercise_revision_id,position,set_count,reps_min,reps_max,rest_seconds)
       VALUES(gen_random_uuid(),$1,$2,0,2,8,10,20)`,
      [wr, er],
    );
    await db.query(
      `WITH months AS (
         INSERT INTO monthly_plans(id,program_version_id,position,title)
         SELECT gen_random_uuid(),$1::uuid,m,'Test month '||m FROM generate_series(1,$5) m RETURNING id,position
       ), weeks AS (
         INSERT INTO plan_weeks(id,monthly_plan_id,position)
         SELECT gen_random_uuid(),m.id,w FROM months m CROSS JOIN generate_series(1,4) w RETURNING id,monthly_plan_id,position
       )
       INSERT INTO plan_days(id,week_id,position,kind,workout_revision_id,nutrition_template_day_id)
       SELECT gen_random_uuid(),w.id,d,CASE WHEN d<=$2 THEN 'TRAINING' ELSE 'REST' END,
         CASE WHEN d<=$2 THEN $3::uuid END,nt.id
       FROM weeks w JOIN months m ON m.id=w.monthly_plan_id CROSS JOIN generate_series(1,7) d
       JOIN nutrition_template_days nt ON nt.nutrition_plan_version_id=$4 AND nt.day_position=(m.position-1)*28+(w.position-1)*7+d`,
      [version, days, wr, nv, months],
    );
    await db.query(
      "UPDATE workout_revisions SET status='PUBLISHED' WHERE id=$1",
      [wr],
    );
    await db.query(
      "UPDATE nutrition_plan_versions SET status='PUBLISHED' WHERE id=$1",
      [nv],
    );
    await db.query(
      `UPDATE program_versions SET status='PUBLISHED' WHERE id=$1`,
      [version],
    );
    return version;
  }
  it('filters eligible programs and assigns exactly one paired first-month schedule', async () => {
    const { headers, rules, matcher, service } = await setup();
    const eligible = await program('FAT_LOSS', 2, 'BEGINNER', 2);
    await program('STRENGTH_HYPERTROPHY');
    await program('FAT_LOSS', 3);
    await program('FAT_LOSS', 2, 'ADVANCED');
    const select = vi.spyOn(matcher, 'select').mockResolvedValue({
      status: 'MATCH',
      selectedProgramVersionId: eligible,
      reasonCodes: ['GOAL_FIT'],
    });
    const [a, b] = await Promise.all([
      api
        .post(prefix + '/me/matching/retry')
        .set(headers)
        .send({}),
      api
        .post(prefix + '/me/matching/retry')
        .set(headers)
        .send({}),
    ]);
    expect(a.status, a.text).toBe(201);
    expect(a.body.runId).toBe(b.body.runId);
    expect(await service.processOne()).toBe(true);
    expect(
      (select.mock.calls[0][0] as any).candidates.map((c: any) => c.id),
    ).toEqual([eligible]);
    expect(JSON.stringify(select.mock.calls[0][0])).not.toContain(
      'Private name',
    );
    expect(JSON.stringify(select.mock.calls[0][0])).not.toContain('@example');
    const status = await api.get(prefix + '/me/matching/status').set(headers);
    expect(status.body).toMatchObject({
      status: 'MATCH',
      selectedProgramVersionId: eligible,
      assignmentStatus: 'ASSIGNED',
      enrollmentId: expect.any(String),
    });
    const enrollment = await api
      .get(prefix + '/me/program')
      .set(headers)
      .expect(200);
    expect(enrollment.body).toMatchObject({
      status: 'ASSIGNED',
      enrollmentId: status.body.enrollmentId,
      programVersionId: eligible,
      nutritionPlanVersionId: expect.any(String),
    });
    const [calendar] = await db.query(
      `
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE pd.kind='TRAINING')::int AS training,
        count(*) FILTER (WHERE nd.day_position<>sd.local_date-e.starts_on+1)::int AS mismatched
      FROM scheduled_days sd JOIN program_enrollments e ON e.id=sd.enrollment_id
      JOIN plan_days pd ON pd.id=sd.plan_day_id
      JOIN nutrition_template_days nd ON nd.id=sd.nutrition_template_day_id WHERE e.id=$1
    `,
      [enrollment.body.enrollmentId],
    );
    expect(calendar).toEqual({ total: 28, training: 8, mismatched: 0 });
    const [today] = await db.query(
      `
      SELECT sd.id,we.id AS exercise FROM scheduled_days sd
      JOIN program_enrollments e ON e.id=sd.enrollment_id
      JOIN plan_days pd ON pd.id=sd.plan_day_id
      JOIN workout_exercises we ON we.workout_revision_id=pd.workout_revision_id
      WHERE e.id=$1 AND sd.local_date=e.starts_on
    `,
      [enrollment.body.enrollmentId],
    );
    expect(today).toBeDefined();
    const workout = prefix + '/me/workouts';
    const started = await api
      .post(workout + '/days/' + today.id + '/start')
      .set(headers)
      .expect(201);
    const session = workout + '/' + started.body.id;
    const set = session + '/exercises/' + today.exercise + '/sets/1';
    await api
      .post(session + '/complete')
      .set(headers)
      .expect(409);
    await api
      .put(set)
      .set(headers)
      .send({ status: 'COMPLETED', actualReps: 9, weightKg: 8 })
      .expect(200);
    await api
      .put(set)
      .set(headers)
      .send({ status: 'COMPLETED', actualReps: 10, weightKg: 8 })
      .expect(200);
    await api
      .post(session + '/abandon')
      .set(headers)
      .expect(201);
    const resumed = await api
      .post(workout + '/days/' + today.id + '/start')
      .set(headers)
      .expect(201);
    expect(resumed.body).toMatchObject({
      id: started.body.id,
      summary: { recordedReps: 10, completedSets: 1 },
    });
    await api
      .put(session + '/exercises/' + today.exercise + '/sets/2')
      .set(headers)
      .send({ status: 'SKIPPED' })
      .expect(200);
    await api
      .post(session + '/complete')
      .set(headers)
      .expect(409);
    await api
      .put(session + '/exercises/' + today.exercise + '/completion')
      .set(headers)
      .send({ completed: true })
      .expect(200);
    expect(
      (
        await api
          .post(session + '/complete')
          .set(headers)
          .expect(201)
      ).body,
    ).toMatchObject({
      status: 'COMPLETED',
      summary: {
        recordedReps: 10,
        completedSets: 1,
        completedExercises: 1,
        isPartial: true,
      },
    });
    await api
      .post(session + '/complete')
      .set(headers)
      .expect(201);
    expect(
      (
        await api
          .post(
            prefix + '/admin/matching/rulesets/' + rules.body.id + '/publish',
          )
          .set(headers)
          .send({ qualityApproved: true, evaluationReference: 'second-review' })
      ).status,
    ).toBe(409);
    const stranger = await register('stranger@example.test');
    await api.get(session).set(bearer(stranger.accessToken)).expect(404);
    expect(
      (
        await api
          .get(prefix + '/admin/matching/runs/' + a.body.runId)
          .set(bearer(stranger.accessToken))
      ).status,
    ).toBe(403);
    expect(
      (
        await api
          .get(prefix + '/me/matching/status')
          .set(bearer(stranger.accessToken))
      ).body.runId,
    ).toBeNull();
  });
  it('queues matching for recommendation inputs without queuing it for display fields', async () => {
    const { headers } = await setup();
    await program();

    const displayEdit = await api
      .patch(prefix + '/me')
      .set(headers)
      .send({ name: 'Updated athlete name', locale: 'ar' });
    expect(displayEdit.status, displayEdit.text).toBe(200);
    expect(displayEdit.body.name).toBe('Updated athlete name');
    const beforeWeightEdit = await api
      .get(prefix + '/me/matching/status')
      .set(headers);
    expect(beforeWeightEdit.body).toEqual({
      status: 'NOT_STARTED',
      runId: null,
    });

    const weightEdit = await api
      .patch(prefix + '/me')
      .set(headers)
      .send({ weight_kg: 81 });
    expect(weightEdit.status, weightEdit.text).toBe(200);
    const afterWeightEdit = await api
      .get(prefix + '/me/matching/status')
      .set(headers);
    expect(afterWeightEdit.body).toMatchObject({
      status: 'PENDING',
      runId: expect.any(String),
    });
  });

  it('returns NO_MATCH with zero provider calls for an empty eligible catalog', async () => {
    const { headers, matcher, service } = await setup();
    const select = vi.spyOn(matcher, 'select');
    const r = await api
      .post(prefix + '/me/matching/retry')
      .set(headers)
      .send({});
    expect(r.body.status).toBe('NO_MATCH');
    expect(await service.processOne()).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
  it('rejects forged selections and marks output stale when inputs change mid-call', async () => {
    const { user, headers, matcher, service } = await setup();
    const eligible = await program();
    const select = vi.spyOn(matcher, 'select').mockResolvedValue({
      status: 'MATCH',
      selectedProgramVersionId: crypto.randomUUID(),
      reasonCodes: ['PROFILE_FIT'],
    });
    await api
      .post(prefix + '/me/matching/retry')
      .set(headers)
      .send({});
    await service.processOne();
    expect(
      (await api.get(prefix + '/me/matching/status').set(headers)).body,
    ).toMatchObject({
      status: 'FAILED',
      failureCode: 'MATCHING_INVALID_OUTPUT',
    });
    await api
      .post(prefix + '/me/matching/retry')
      .set(headers)
      .send({});
    select.mockImplementationOnce(async () => {
      await db.query('UPDATE user_profiles SET weight_kg=81 WHERE user_id=$1', [
        user.user.id,
      ]);
      return {
        status: 'MATCH',
        selectedProgramVersionId: eligible,
        reasonCodes: ['PROFILE_FIT'],
      };
    });
    await service.processOne();
    expect(
      (await api.get(prefix + '/me/matching/status').set(headers)).body.status,
    ).toBe('STALE');
  });
  it('bounds retries and isolates provider failures from existing profile data', async () => {
    const { headers, matcher, service } = await setup();
    await program();
    vi.spyOn(matcher, 'select').mockRejectedValue(
      new Error('provider secret must not be saved'),
    );
    const r = await api
      .post(prefix + '/me/matching/retry')
      .set(headers)
      .send({});
    await service.processOne();
    await db.query(
      `UPDATE recommendation_runs SET available_at=now() WHERE id=$1`,
      [r.body.runId],
    );
    await service.processOne();
    const audit = await api
      .get(prefix + '/admin/matching/runs/' + r.body.runId)
      .set(headers);
    expect(audit.body.status).toBe('FAILED');
    expect(audit.body.attempts).toBe(2);
    expect(audit.body.failure_code).toBe('AI_MATCHING_UNAVAILABLE');
    expect(JSON.stringify(audit.body)).not.toContain('provider secret');
  });

  it('bounds automatic rematching allocations while preserving profile edits', async () => {
    const { user, service } = await setup();
    await program();
    for (let i = 0; i < 11; i++) {
      await db.query('UPDATE user_profiles SET weight_kg=$2 WHERE user_id=$1', [
        user.user.id,
        80 + i,
      ]);
      const r = await service.triggerUser(user.user.id);
      expect(r.status).toBe(i < 10 ? 'PENDING' : 'RATE_LIMITED');
    }
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM recommendation_runs WHERE user_id=$1',
          [user.user.id],
        )
      )[0].n,
    ).toBe(10);
  });
  it('simulates draft rules without assignment and rejects unavailable lookup values', async () => {
    const { headers, matcher, service } = await setup();
    const eligible = await program();
    const draft = await api
      .post(prefix + '/admin/matching/rulesets')
      .set(headers)
      .send({
        instructionVersion: 'simulation-v1',
        instructions:
          'Compare supplied descriptions without overriding eligibility.',
        model: 'fixture/model',
      });
    const input = {
      primaryGoal: 'FAT_LOSS',
      fitnessLevel: 'BEGINNER',
      trainingDaysPerWeek: 2,
      age: 28,
      heightCm: 175,
      weightKg: 80,
      targetWeightKg: 72,
      gender: 'FEMALE',
    };
    expect(
      (
        await api
          .post(
            prefix + '/admin/matching/rulesets/' + draft.body.id + '/simulate',
          )
          .set(headers)
          .send({ ...input, fitnessLevel: 'UNKNOWN_LEVEL' })
      ).status,
    ).toBe(422);
    vi.spyOn(matcher, 'select').mockResolvedValue({
      status: 'MATCH',
      selectedProgramVersionId: eligible,
      reasonCodes: ['LEVEL_FIT'],
    });
    const simulated = await api
      .post(prefix + '/admin/matching/rulesets/' + draft.body.id + '/simulate')
      .set(headers)
      .send(input);
    expect(simulated.status, simulated.text).toBe(201);
    await service.processOne();
    const audit = await api
      .get(prefix + '/admin/matching/runs/' + simulated.body.runId)
      .set(headers);
    expect(audit.body).toMatchObject({
      kind: 'SIMULATION',
      user_id: null,
      status: 'MATCH',
    });
    expect(
      (await api.get(prefix + '/me/matching/status').set(headers)).body.status,
    ).toBe('NOT_STARTED');
  });
  it('reclaims an expired lease and prevents the superseded worker overwriting the decision', async () => {
    const { headers, matcher, service } = await setup();
    const eligible = await program();
    let release!: (value: unknown) => void;
    const select = vi
      .spyOn(matcher, 'select')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue({
        status: 'MATCH',
        selectedProgramVersionId: eligible,
        reasonCodes: ['SCHEDULE_FIT'],
      });
    const created = await api
      .post(prefix + '/me/matching/retry')
      .set(headers)
      .send({});
    const first = service.processOne();
    await vi.waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    await db.query(
      `UPDATE recommendation_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`,
      [created.body.runId],
    );
    await service.processOne();
    release({
      status: 'NO_MATCH',
      selectedProgramVersionId: null,
      reasonCodes: ['NO_SUITABLE_PROGRAM'],
    });
    await first;
    const status = await api.get(prefix + '/me/matching/status').set(headers);
    expect(status.body).toMatchObject({
      status: 'MATCH',
      selectedProgramVersionId: eligible,
    });
  });
  it('invalidates queued runs before provider calls when eligible content is archived', async () => {
    const { headers, matcher, service } = await setup();
    const eligible = await program();
    const select = vi.spyOn(matcher, 'select');
    await api
      .post(prefix + '/me/matching/retry')
      .set(headers)
      .send({});
    await db.query(
      `UPDATE programs SET archived=true WHERE id=(SELECT program_id FROM program_versions WHERE id=$1)`,
      [eligible],
    );
    await service.processOne();
    expect(select).not.toHaveBeenCalled();
    expect(
      (await api.get(prefix + '/me/matching/status').set(headers)).body.status,
    ).toBe('STALE');
    expect(
      (
        await api
          .post(prefix + '/me/matching/retry')
          .set(headers)
          .send({})
      ).body.status,
    ).toBe('NO_MATCH');
  });
});

describe('Figma daily activity', () => {
  it('stores water in the profile local day, sums entries and allows only the owner to remove them', async () => {
    const athlete = await register();
    const stranger = await register('activity-stranger@example.test');
    const headers = bearer(athlete.accessToken);
    await db.query(
      `UPDATE user_profiles SET timezone='Pacific/Kiritimati' WHERE user_id=$1`,
      [athlete.user.id],
    );
    const [today] = await db.query(
      `SELECT (now() AT TIME ZONE 'Pacific/Kiritimati')::date::text AS date`,
    );
    const add = await api
      .post(prefix + '/me/activity/water')
      .set(headers)
      .send({});
    expect(add.status, add.text).toBe(201);
    expect(add.body).toMatchObject({ date: today.date, milliliters: 250 });
    await api
      .post(prefix + '/me/activity/water')
      .set(headers)
      .send({ milliliters: 500 })
      .expect(201);
    const daily = await api
      .get(prefix + '/me/activity/daily')
      .set(headers)
      .query({ date: today.date });
    expect(daily.status, daily.text).toBe(200);
    expect(daily.body.water).toMatchObject({
      totalMl: 750,
      goalMl: 2500,
      logCount: 2,
    });
    await api
      .delete(prefix + '/me/activity/water/' + add.body.id)
      .set(bearer(stranger.accessToken))
      .expect(404);
    await api
      .delete(prefix + '/me/activity/water/' + add.body.id)
      .set(headers)
      .expect(200);
    const after = await api.get(prefix + '/me/activity/daily').set(headers);
    expect(after.body.water.totalMl).toBe(500);
    await api
      .get(prefix + '/me/activity/daily?date=2100-01-01')
      .set(headers)
      .expect(422);
    await api
      .get(prefix + '/me/activity/daily?date=2026-02-30')
      .set(headers)
      .expect(400);
    await api.get(prefix + '/me/activity/daily').expect(401);
  });

  it('persists editable goals and separate step completion without adding fabricated steps', async () => {
    const athlete = await register();
    const headers = bearer(athlete.accessToken);
    const route = prefix + '/me/activity';
    const goals = await api
      .put(route + '/goals')
      .set(headers)
      .send({ waterGoalMl: 3000, stepsGoal: 8000 });
    expect(goals.status, goals.text).toBe(200);
    expect(goals.body).toEqual({ waterGoalMl: 3000, stepsGoal: 8000 });
    await api
      .put(route + '/steps')
      .set(headers)
      .send({ steps: 6240 })
      .expect(200);
    const completed = await api
      .put(route + '/steps')
      .set(headers)
      .send({ manuallyCompleted: true });
    expect(completed.body).toMatchObject({
      count: 6240,
      goal: 8000,
      manuallyCompleted: true,
      goalReached: true,
    });
    const daily = await api.get(route + '/daily').set(headers);
    expect(daily.body.steps).toEqual({
      count: 6240,
      goal: 8000,
      manuallyCompleted: true,
      goalReached: true,
    });
    await api
      .put(route + '/steps')
      .set(headers)
      .send({ manuallyCompleted: false })
      .expect(200);
    await api
      .put(route + '/steps')
      .set(headers)
      .send({ steps: -1 })
      .expect(400);
    const reset = await api
      .put(route + '/goals')
      .set(headers)
      .send({ waterGoalMl: null, stepsGoal: null });
    expect(reset.body).toEqual({ waterGoalMl: 2500, stepsGoal: 10000 });
  });
});

describe('Single Admin CLI, F06 Enrollment/Schedule, F17 Fitting, F08 Nutrition Swaps, F12 Dashboard & Program Catalog', () => {
  it('enforces a single administrator account via CLI bootstrap and database constraint', async () => {
    const { createAdmin } =
      await import('../../src/infrastructure/database/create-admin.js');
    const adminId = await createAdmin(
      db,
      'studio-admin@example.test',
      password,
    );
    expect(adminId).toEqual(expect.any(String));

    await expect(
      createAdmin(db, 'second-admin@example.test', password),
    ).rejects.toThrow('An admin account already exists');

    const secondUser = await register('second-user@example.test');
    await expect(
      db.query("INSERT INTO user_roles(user_id,role_code) VALUES($1,'ADMIN')", [
        secondUser.user.id,
      ]),
    ).rejects.toThrow();

    const adminLogin = await api
      .post(prefix + '/auth/login')
      .send({ email: 'studio-admin@example.test', password })
      .expect(200);
    await api
      .get(prefix + '/admin/programs')
      .set(bearer(adminLogin.body.accessToken))
      .expect(200);
  });

  it('evaluates daily exercise fitting with active injuries, exempts all-blocked due days, and unlocks month 2', async () => {
    const { createAdmin } =
      await import('../../src/infrastructure/database/create-admin.js');
    const adminId = await createAdmin(db, 'admin-fit@example.test', password);
    void adminId;
    const athlete = await register('fitter-athlete@example.test');
    const headers = bearer(athlete.accessToken);

    const { seedPublishedProgramsAndRuleset } =
      await import('../../src/infrastructure/database/seeds/program-catalog.js');
    const seeded = await seedPublishedProgramsAndRuleset(
      db,
      'google/gemini-2.5-flash',
    );
    expect(seeded.totalCatalogPrograms).toBeGreaterThanOrEqual(12);

    const { PROGRAM_MATCHER } =
      await import('../../src/modules/matching/matching.contract.js');
    const { ProgramMatchingService } =
      await import('../../src/modules/matching/program-matching.service.js');
    const { ExerciseFittingService } =
      await import('../../src/modules/fitting/fitting.service.js');
    const matcher = app.get(PROGRAM_MATCHER);
    const matchingService = app.get(ProgramMatchingService);
    const fittingService = app.get(ExerciseFittingService);

    const [targetProgram] = await db.query(
      `SELECT pv.id FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.slug='fat-loss-foundation-3d'`,
    );
    vi.spyOn(matcher, 'select').mockResolvedValue({
      status: 'MATCH',
      selectedProgramVersionId: targetProgram.id,
      reasonCodes: ['GOAL_FIT', 'LEVEL_FIT', 'SCHEDULE_FIT'],
    });

    const [weekdays] = await db.query(
      `SELECT ARRAY[
         (ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'])[1+extract(dow FROM now() AT TIME ZONE 'UTC')::int],
         (ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'])[1+extract(dow FROM (now() AT TIME ZONE 'UTC')+interval '1 day')::int],
         (ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'])[1+extract(dow FROM (now() AT TIME ZONE 'UTC')+interval '2 days')::int]
       ] AS days`,
    );

    await api
      .put(prefix + '/me/onboarding')
      .set(headers)
      .send({
        name: 'Fitter Athlete',
        gender: 'MALE',
        height_cm: 178,
        weight_kg: 92,
        target_weight_kg: 80,
        primary_goal: 'FAT_LOSS',
        fitness_level: 'BEGINNER',
        training_days_per_week: weekdays.days,
        timezone: 'UTC',
        locale: 'en',
        date_of_birth: '1996-05-10',
        food_preferences: {
          allergen_codes: [],
          disliked_food_ids: [],
        },
      })
      .expect(200);

    await matchingService.processOne();

    const currentProg = await api
      .get(prefix + '/me/program')
      .set(headers)
      .expect(200);
    expect(currentProg.body.status).toBe('ASSIGNED');
    expect(currentProg.body.programVersionId).toBe(targetProgram.id);

    const monthsBefore = await api
      .get(prefix + '/me/program/months')
      .set(headers)
      .expect(200);
    expect(monthsBefore.body.items).toHaveLength(2);
    expect(monthsBefore.body.items[0]).toMatchObject({
      position: 1,
      status: 'SCHEDULED',
      trainingDayCount: 12,
      completedWorkoutCount: 0,
      exemptDayCount: 0,
      pendingTrainingDayCount: 12,
      unlockProgress: 0,
    });
    expect(monthsBefore.body.items[1].status).toBe('LOCKED');

    // Without active injuries, GET /me/days/:date returns NOT_REQUIRED fitting without calling AI
    const dayViewNoInjury = await api
      .get(prefix + '/me/days/' + currentProg.body.localToday)
      .set(headers)
      .expect(200);
    expect(dayViewNoInjury.body.fitting.status).toBe('NOT_REQUIRED');
    expect(
      dayViewNoInjury.body.workout.exercises.every(
        (e: { restrictionStatus: string }) =>
          e.restrictionStatus === 'NO_IDENTIFIED_CONFLICT',
      ),
    ).toBe(true);

    // Add a confirmed active knee injury
    const injuryRes = await api
      .post(prefix + '/me/injuries')
      .set(headers)
      .send({
        body_area_code: 'KNEE',
        side: 'LEFT',
        description: 'Pain during deep knee flexion under load',
        confirmed: true,
      })
      .expect(201);

    process.env.AI_FITTING_URL = 'http://ai:3001/internal/v1/fit';
    process.env.AI_SERVICE_TOKEN = 'a'.repeat(36);
    process.env.AI_RETENTION_APPROVED = 'true';

    const exerciseIds = dayViewNoInjury.body.workout.exercises.map(
      (e: { id: string }) => e.id,
    );
    // All exercises blocked -> day becomes EXEMPT when started
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            policyVersion: 'reported-injury-fit-v1',
            modelVersion: 'google/gemini-2.5-flash',
            decisions: exerciseIds.map((id: string) => ({
              workoutExerciseId: id,
              status: 'BLOCKED',
            })),
          }),
          { status: 200 },
        ),
      ),
    );

    const fittingQueued = await api
      .get(prefix + '/me/workouts/days/' + dayViewNoInjury.body.id + '/fitting')
      .set(headers)
      .expect(202);
    expect(fittingQueued.body.status).toBe('PENDING');

    expect(await fittingService.processOne()).toBe(true);

    const fittingReady = await api
      .get(prefix + '/me/workouts/days/' + dayViewNoInjury.body.id + '/fitting')
      .set(headers)
      .expect(200);
    expect(fittingReady.body.status).toBe('READY');

    const startExempt = await api
      .post(prefix + '/me/workouts/days/' + dayViewNoInjury.body.id + '/start')
      .set(headers)
      .expect(201);
    expect(startExempt.body).toMatchObject({
      id: null,
      scheduledDayId: dayViewNoInjury.body.id,
      status: 'EXEMPT',
    });

    const monthsAfterExempt = await api
      .get(prefix + '/me/program/months')
      .set(headers)
      .expect(200);
    expect(monthsAfterExempt.body.items[0]).toMatchObject({
      exemptDayCount: 1,
      completedWorkoutCount: 0,
      pendingTrainingDayCount: 11,
    });

    // Removing the injury in an unfinished month reopens the EXEMPT day back to SCHEDULED
    await api
      .delete(prefix + '/me/injuries/' + injuryRes.body.injury.id)
      .set(headers)
      .send({ confirmed: true })
      .expect(200);

    const dayAfterInjuryRemoved = await api
      .get(prefix + '/me/days/' + currentProg.body.localToday)
      .set(headers)
      .expect(200);
    expect(dayAfterInjuryRemoved.body.status).toBe('SCHEDULED');
  });

  it('supports program change proposals and explicit acceptance without losing prior history', async () => {
    const { seedPublishedProgramsAndRuleset } =
      await import('../../src/infrastructure/database/seeds/program-catalog.js');
    await seedPublishedProgramsAndRuleset(db, 'google/gemini-2.5-flash');

    const athlete = await register('switch-athlete@example.test');
    const headers = bearer(athlete.accessToken);
    const { PROGRAM_MATCHER } =
      await import('../../src/modules/matching/matching.contract.js');
    const { ProgramMatchingService } =
      await import('../../src/modules/matching/program-matching.service.js');
    const matcher = app.get(PROGRAM_MATCHER);
    const matchingService = app.get(ProgramMatchingService);

    const [fatLossProg] = await db.query(
      `SELECT pv.id FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.slug='fat-loss-foundation-3d'`,
    );
    const [muscleProg] = await db.query(
      `SELECT pv.id FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.slug='muscle-foundation-full-body-3d'`,
    );

    const selectSpy = vi.spyOn(matcher, 'select').mockResolvedValueOnce({
      status: 'MATCH',
      selectedProgramVersionId: fatLossProg.id,
      reasonCodes: ['GOAL_FIT'],
    });

    await api
      .put(prefix + '/me/onboarding')
      .set(headers)
      .send({
        name: 'Switch Athlete',
        gender: 'MALE',
        height_cm: 180,
        weight_kg: 84,
        target_weight_kg: 78,
        primary_goal: 'FAT_LOSS',
        fitness_level: 'BEGINNER',
        training_days_per_week: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
        timezone: 'UTC',
        locale: 'en',
        date_of_birth: '1997-02-15',
        food_preferences: {
          allergen_codes: [],
          disliked_food_ids: [],
        },
      })
      .expect(200);
    await matchingService.processOne();

    const firstProgram = await api
      .get(prefix + '/me/program')
      .set(headers)
      .expect(200);
    expect(firstProgram.body.programVersionId).toBe(fatLossProg.id);
    expect(firstProgram.body.pendingProposal).toBeNull();

    // User changes primary_goal to STRENGTH_HYPERTROPHY -> triggers new recommendation without ending current enrollment
    selectSpy.mockResolvedValueOnce({
      status: 'MATCH',
      selectedProgramVersionId: muscleProg.id,
      reasonCodes: ['GOAL_FIT', 'LEVEL_FIT'],
    });
    await api
      .patch(prefix + '/me')
      .set(headers)
      .send({ primary_goal: 'STRENGTH_HYPERTROPHY' })
      .expect(200);
    await matchingService.processOne();

    const withProposal = await api
      .get(prefix + '/me/program')
      .set(headers)
      .expect(200);
    expect(withProposal.body.programVersionId).toBe(fatLossProg.id);
    expect(withProposal.body.pendingProposal).toMatchObject({
      programVersionId: muscleProg.id,
      recommendationRunId: expect.any(String),
    });

    const accepted = await api
      .post(prefix + '/me/program/change/accept')
      .set(headers)
      .send({
        recommendationRunId:
          withProposal.body.pendingProposal.recommendationRunId,
      })
      .expect(201);
    expect(accepted.body.programVersionId).toBe(muscleProg.id);
    expect(accepted.body.pendingProposal).toBeNull();

    const enrollments = await db.query(
      'SELECT id,program_version_id,ended_at FROM program_enrollments WHERE user_id=$1 ORDER BY created_at',
      [athlete.user.id],
    );
    expect(enrollments).toHaveLength(2);
    expect(enrollments[0].ended_at).not.toBeNull();
    expect(enrollments[1].ended_at).toBeNull();
  });

  it('executes daily user nutrition, allergen/dislike flags, item swaps, whole-meal swaps, completion, and home dashboard', async () => {
    const { seedPublishedProgramsAndRuleset } =
      await import('../../src/infrastructure/database/seeds/program-catalog.js');
    await seedPublishedProgramsAndRuleset(db, 'google/gemini-2.5-flash');

    const athlete = await register('nutrition-athlete@example.test');
    const headers = bearer(athlete.accessToken);
    const { PROGRAM_MATCHER } =
      await import('../../src/modules/matching/matching.contract.js');
    const { ProgramMatchingService } =
      await import('../../src/modules/matching/program-matching.service.js');
    const matcher = app.get(PROGRAM_MATCHER);
    const matchingService = app.get(ProgramMatchingService);

    const [fatLossProg] = await db.query(
      `SELECT pv.id FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.slug='fat-loss-foundation-3d'`,
    );
    vi.spyOn(matcher, 'select').mockResolvedValueOnce({
      status: 'MATCH',
      selectedProgramVersionId: fatLossProg.id,
      reasonCodes: ['GOAL_FIT'],
    });

    // User has a MILK allergy (Greek yogurt in breakfast has MILK allergen)
    await api
      .put(prefix + '/me/onboarding')
      .set(headers)
      .send({
        name: 'Nutrition Athlete',
        gender: 'FEMALE',
        height_cm: 166,
        weight_kg: 68,
        target_weight_kg: 62,
        primary_goal: 'FAT_LOSS',
        fitness_level: 'BEGINNER',
        training_days_per_week: ['SUNDAY', 'TUESDAY', 'THURSDAY'],
        timezone: 'UTC',
        locale: 'en',
        date_of_birth: '1999-08-20',
        food_preferences: {
          allergen_codes: ['MILK'],
          disliked_food_ids: [],
        },
      })
      .expect(200);
    await matchingService.processOne();

    const assignment = await api
      .get(prefix + '/me/nutrition/assignment')
      .set(headers)
      .expect(200);
    expect(assignment.body.status).toBe('ASSIGNED');

    const today = assignment.body.localToday;
    const nutritionDay = await api
      .get(prefix + '/me/nutrition/days/' + today)
      .set(headers)
      .expect(200);
    expect(nutritionDay.body.meals).toHaveLength(3);
    expect(nutritionDay.body.totals.planned.energyKcal).toBeGreaterThan(0);

    // Breakfast is oats-yogurt-banana; the Greek yogurt item has MILK allergen -> isBlocked: true, but meal itself is not blocked!
    const breakfast = nutritionDay.body.meals[0];
    const yogurtItem = breakfast.items.find(
      (i: { isBlocked: boolean }) => i.isBlocked,
    );
    expect(yogurtItem).toBeDefined();
    expect(yogurtItem.matchedAllergens).toEqual(['MILK']);
    expect(breakfast.status).toBe('PENDING');

    // Fetch alternatives for the yogurt item -> excludes MILK items and returns safe protein options
    const itemAlts = await api
      .get(prefix + '/me/meal-items/' + yogurtItem.id + '/alternatives')
      .set(headers)
      .expect(200);
    expect(itemAlts.body.status).toBe('AVAILABLE');
    expect(itemAlts.body.items.length).toBeGreaterThan(0);

    // Swap the yogurt item with the first safe alternative
    const swappedMeal = await api
      .post(prefix + '/me/meal-items/' + yogurtItem.id + '/substitutions')
      .set(headers)
      .send({ selectedMemberId: itemAlts.body.items[0].memberId })
      .expect(201);
    const updatedItem = swappedMeal.body.items.find(
      (i: { id: string }) => i.id === yogurtItem.id,
    );
    expect(updatedItem.isBlocked).toBe(false);
    expect(updatedItem.selectedMemberId).toBe(itemAlts.body.items[0].memberId);

    // Whole-meal alternatives for breakfast
    const mealAlts = await api
      .get(prefix + '/me/meals/' + breakfast.id + '/alternatives')
      .set(headers)
      .expect(200);
    expect(mealAlts.body.status).toBe('AVAILABLE');
    expect(mealAlts.body.items.length).toBeGreaterThan(0);

    // Swap whole breakfast meal before any item is completed
    const wholeSwapped = await api
      .post(prefix + '/me/meals/' + breakfast.id + '/substitutions')
      .set(headers)
      .send({ selectedMealVersionId: mealAlts.body.items[0].mealVersionId })
      .expect(201);
    expect(wholeSwapped.body.selectedMealVersionId).toBe(
      mealAlts.body.items[0].mealVersionId,
    );
    expect(wholeSwapped.body.selectionVersion).toBe(2);

    // Complete one item -> meal status becomes PARTIAL, and whole-meal swap is now rejected with MEAL_ALREADY_STARTED
    const firstActiveItem = wholeSwapped.body.items[0];
    const partialMeal = await api
      .put(prefix + '/me/meal-items/' + firstActiveItem.id + '/completion')
      .set(headers)
      .send({ completed: true })
      .expect(200);
    expect(partialMeal.body.status).toBe('PARTIAL');

    const blockedWholeSwap = await api
      .post(prefix + '/me/meals/' + breakfast.id + '/substitutions')
      .set(headers)
      .send({ selectedMealVersionId: breakfast.originalMealVersionId })
      .expect(409);
    expect(blockedWholeSwap.body.code).toBe('MEAL_ALREADY_STARTED');

    // Complete the whole meal
    const completedMeal = await api
      .put(prefix + '/me/meals/' + breakfast.id + '/completion')
      .set(headers)
      .send({ completed: true })
      .expect(200);
    expect(completedMeal.body.status).toBe('COMPLETED');
    expect(completedMeal.body.totals.consumed.energyKcal).toBe(
      completedMeal.body.totals.selected.energyKcal,
    );

    // Check unified Home Dashboard and Progress endpoints
    const home = await api
      .get(prefix + '/me/dashboard')
      .set(headers)
      .expect(200);
    expect(home.body.program.status).toBe('ASSIGNED');
    expect(home.body.todayNutrition).toMatchObject({
      mealCount: 3,
      completedMealCount: 1,
    });

    const progress = await api
      .get(prefix + '/me/progress')
      .set(headers)
      .expect(200);
    expect(progress.body.nutrition).toMatchObject({
      trackedDays: 1,
      totalMeals: 3,
      completedMeals: 1,
    });
  });

  it('previews AI-rewritten program hints for administrators without mutating the program', async () => {
    const { createAdmin } =
      await import('../../src/infrastructure/database/create-admin.js');
    await createAdmin(db, 'hint-admin@example.test', password);
    const login = await api
      .post(prefix + '/auth/login')
      .send({ email: 'hint-admin@example.test', password })
      .expect(200);
    const headers = bearer(login.body.accessToken);

    const { seedPublishedProgramsAndRuleset } =
      await import('../../src/infrastructure/database/seeds/program-catalog.js');
    await seedPublishedProgramsAndRuleset(db, 'google/gemini-2.5-flash');

    const [prog] = await db.query(
      `SELECT id FROM programs WHERE slug='fat-loss-foundation-3d'`,
    );

    process.env.AI_REWRITE_URL = 'http://ai:3001/internal/v1/rewrite';
    process.env.AI_SERVICE_TOKEN = 'a'.repeat(36);
    process.env.AI_RETENTION_APPROVED = 'true';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            structuredHints: {
              summary: 'Joint-friendly 3-day metabolic fat loss program.',
              intendedAudience: 'Beginners and intermediates with dumbbells',
              suitabilityNotes: ['Low-impact lower body', '3 days per week'],
              ambiguities: [],
              unsupportedClaims: [],
            },
            modelVersion: 'google/gemini-2.5-flash',
            instructionVersion: 'program-hints-rewrite-v1',
          }),
          { status: 200 },
        ),
      ),
    );

    const preview = await api
      .post(prefix + `/admin/programs/${prog.id}/hints/rewrite`)
      .set(headers)
      .send({
        originalText:
          'Best for beginners looking for 3-day joint-friendly fat loss.',
      })
      .expect(201);
    expect(preview.body).toMatchObject({
      previewOnly: true,
      instructionVersion: 'program-hints-rewrite-v1',
      structuredHints: {
        summary: 'Joint-friendly 3-day metabolic fat loss program.',
      },
    });
  });

  it('tracks weight history, periodic 3-day check-ins, notifications inbox, and water reminder schedules', async () => {
    const { seedPublishedProgramsAndRuleset } =
      await import('../../src/infrastructure/database/seeds/program-catalog.js');
    await seedPublishedProgramsAndRuleset(db, 'google/gemini-2.5-flash');

    const user = await register('checkin-athlete@example.test');
    const headers = bearer(user.accessToken);

    const [programVersion] = await db.query(
      `SELECT pv.id FROM program_versions pv JOIN programs p ON p.id=pv.program_id WHERE p.slug='fat-loss-foundation-3d'`,
    );
    const { PROGRAM_MATCHER } =
      await import('../../src/modules/matching/matching.contract.js');
    const { ProgramMatchingService } =
      await import('../../src/modules/matching/program-matching.service.js');
    const matcher = app.get(PROGRAM_MATCHER);
    vi.spyOn(matcher, 'select').mockResolvedValueOnce({
      status: 'MATCH',
      selectedProgramVersionId: programVersion.id,
      reasonCodes: ['GOAL_FIT'],
    });

    const onboard = await api
      .put(prefix + '/me/onboarding')
      .set(headers)
      .send({
        name: 'Check-In Athlete',
        gender: 'MALE',
        date_of_birth: '1995-04-12',
        timezone: 'UTC',
        locale: 'en',
        height_cm: 180,
        weight_kg: 88,
        target_weight_kg: 80,
        primary_goal: 'FAT_LOSS',
        fitness_level: 'BEGINNER',
        training_days_per_week: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
        food_preferences: { allergen_codes: [], disliked_food_ids: [] },
      })
      .expect(200);
    expect(onboard.headers['x-ratelimit-limit']).toBeDefined();
    expect(onboard.headers['x-ratelimit-remaining']).toBeDefined();

    await app.get(ProgramMatchingService).processOne();

    // Verify PROGRAM_READY notification was automatically created
    const inbox1 = await api
      .get(prefix + '/me/notifications')
      .set(headers)
      .expect(200);
    expect(inbox1.body.unreadCount).toBe(1);
    expect(inbox1.body.items[0].type).toBe('PROGRAM_READY');

    // Mark notification as read
    const readOne = await api
      .put(prefix + `/me/notifications/${inbox1.body.items[0].id}/read`)
      .set(headers)
      .expect(200);
    expect(readOne.body.readAt).toBeTruthy();

    // Check initial check-in status is DUE
    const checkInsBefore = await api
      .get(prefix + '/me/check-ins')
      .set(headers)
      .expect(200);
    expect(checkInsBefore.body.status).toBe('DUE');
    expect(checkInsBefore.body.items).toHaveLength(0);

    // Submit a 3-day check-in with updated weight
    const submittedCheckIn = await api
      .post(prefix + '/me/check-ins')
      .set(headers)
      .send({
        workoutDifficulty: 'MODERATE',
        nutritionAdherence: 'HIGH',
        weightKg: 86.5,
        notes: 'Feeling energetic and hitting daily meals.',
      })
      .expect(201);
    expect(submittedCheckIn.body.status).toBe('UPCOMING');
    expect(submittedCheckIn.body.daysUntilDue).toBe(3);
    expect(submittedCheckIn.body.weightKg).toBe(86.5);
    expect(submittedCheckIn.body.automatedSummary).toContain('86.5 kg');

    // Verify weight history and profile weight update
    const weightHistory = await api
      .get(prefix + '/me/weight-history')
      .set(headers)
      .expect(200);
    expect(weightHistory.body.currentWeightKg).toBe(86.5);
    expect(weightHistory.body.targetWeightKg).toBe(80);
    expect(weightHistory.body.items).toHaveLength(1);
    expect(weightHistory.body.items[0].source).toBe('CHECK_IN');

    // Mark all notifications as read
    const readAll = await api
      .post(prefix + '/me/notifications/read-all')
      .set(headers)
      .expect(200);
    expect(readAll.body.updatedCount).toBe(1);
    expect(readAll.body.unreadCount).toBe(0);

    // Configure water reminders
    const waterRemindersBefore = await api
      .get(prefix + '/me/water-reminders')
      .set(headers)
      .expect(200);
    expect(waterRemindersBefore.body.enabled).toBe(false);
    expect(waterRemindersBefore.body.nextReminderLocalAt).toBeNull();

    const waterRemindersUpdated = await api
      .put(prefix + '/me/water-reminders')
      .set(headers)
      .send({
        enabled: true,
        intervalMinutes: 45,
        windowStart: '08:30',
        windowEnd: '21:30',
        stopWhenGoalReached: true,
      })
      .expect(200);
    expect(waterRemindersUpdated.body).toMatchObject({
      enabled: true,
      intervalMinutes: 45,
      windowStart: '08:30',
      windowEnd: '21:30',
      stopWhenGoalReached: true,
    });
    expect(waterRemindersUpdated.body.nextReminderLocalAt).toBeTruthy();
  });

  it('serves bilingual FAQ, active legal documents, user legal acceptances, and admin support CRUD', async () => {
    const faqEn = await api.get(prefix + '/faq?locale=en').expect(200);
    expect(faqEn.body.items.length).toBeGreaterThanOrEqual(4);

    const faqAr = await api.get(prefix + '/faq?locale=ar').expect(200);
    expect(faqAr.body.items.length).toBeGreaterThanOrEqual(2);

    const termsEn = await api
      .get(prefix + '/legal/terms?locale=en')
      .expect(200);
    expect(termsEn.body.type).toBe('TERMS');
    expect(termsEn.body.version).toBe('1.0.0');

    const privacyAr = await api
      .get(prefix + '/legal/privacy?locale=ar')
      .expect(200);
    expect(privacyAr.body.type).toBe('PRIVACY');
    expect(privacyAr.body.locale).toBe('ar');

    // User accepts legal document
    const user = await register('legal-user@example.test');
    const userHeaders = bearer(user.accessToken);
    const accepted = await api
      .post(prefix + '/me/legal-acceptances')
      .set(userHeaders)
      .send({ documentId: termsEn.body.id })
      .expect(200);
    expect(accepted.body.documentId).toBe(termsEn.body.id);

    const listAcceptances = await api
      .get(prefix + '/me/legal-acceptances')
      .set(userHeaders)
      .expect(200);
    expect(listAcceptances.body.items).toHaveLength(1);
    expect(
      listAcceptances.body.activeDocuments.find(
        (d: { id: string }) => d.id === termsEn.body.id,
      )?.accepted,
    ).toBe(true);

    // Admin CRUD on FAQ and Legal documents
    const { createAdmin } =
      await import('../../src/infrastructure/database/create-admin.js');
    await createAdmin(db, 'support-admin@example.test', password);
    const adminLogin = await api
      .post(prefix + '/auth/login')
      .send({ email: 'support-admin@example.test', password })
      .expect(200);
    const adminHeaders = bearer(adminLogin.body.accessToken);

    const createdFaq = await api
      .post(prefix + '/admin/faq')
      .set(adminHeaders)
      .send({
        slug: 'water-reminder-schedule-en',
        category: 'ACTIVITY',
        locale: 'en',
        question: 'How do smart water reminders work?',
        answer:
          'Reminders fire at your chosen interval and pause once your hydration goal is met.',
        displayOrder: 10,
        active: true,
      })
      .expect(201);
    expect(createdFaq.body.slug).toBe('water-reminder-schedule-en');

    const updatedFaq = await api
      .patch(prefix + `/admin/faq/${createdFaq.body.id}`)
      .set(adminHeaders)
      .send({ active: false })
      .expect(200);
    expect(updatedFaq.body.active).toBe(false);

    await api
      .delete(prefix + `/admin/faq/${createdFaq.body.id}`)
      .set(adminHeaders)
      .expect(200);

    const newTerms = await api
      .post(prefix + '/admin/legal')
      .set(adminHeaders)
      .send({
        type: 'TERMS',
        version: '1.1.0',
        locale: 'en',
        title: 'Motion Terms & Conditions v1.1',
        content: 'Updated terms and conditions for Motion athletes.',
        active: true,
      })
      .expect(201);
    expect(newTerms.body.active).toBe(true);

    const activeTermsNow = await api
      .get(prefix + '/legal/terms?locale=en')
      .expect(200);
    expect(activeTermsNow.body.version).toBe('1.1.0');
  });

  it('records Gemini token usage and serves admin analytics, uptime probes, and integration health', async () => {
    const { createAdmin } =
      await import('../../src/infrastructure/database/create-admin.js');
    await createAdmin(db, 'analytics-admin@example.test', password);
    const adminLogin = await api
      .post(prefix + '/auth/login')
      .send({ email: 'analytics-admin@example.test', password })
      .expect(200);
    const adminHeaders = bearer(adminLogin.body.accessToken);

    const { seedPublishedProgramsAndRuleset } =
      await import('../../src/infrastructure/database/seeds/program-catalog.js');
    await seedPublishedProgramsAndRuleset(db, 'google/gemini-2.5-flash');

    const [prog] = await db.query(
      `SELECT id FROM programs WHERE slug='fat-loss-foundation-3d'`,
    );

    process.env.AI_REWRITE_URL = 'http://ai:3001/internal/v1/rewrite';
    process.env.AI_SERVICE_TOKEN = 'a'.repeat(36);
    process.env.AI_RETENTION_APPROVED = 'true';

    const fetchMock = vi.fn().mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              model: 'google/gemini-2.5-flash',
              uptimeSeconds: 120,
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            structuredHints: {
              summary: 'Joint-friendly 3-day metabolic fat loss plan.',
              intendedAudience: 'Beginners and intermediates',
              suitabilityNotes: ['Low-impact lower body'],
              ambiguities: [],
              unsupportedClaims: [],
            },
            modelVersion: 'google/gemini-2.5-flash',
            instructionVersion: 'program-hints-rewrite-v1',
          }),
          {
            status: 200,
            headers: {
              'x-ai-model': 'google/gemini-2.5-flash',
              'x-ai-input-tokens': '600',
              'x-ai-output-tokens': '150',
              'x-ai-total-tokens': '750',
              'x-ai-latency-ms': '420',
            },
          },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await api
      .post(prefix + `/admin/programs/${prog.id}/hints/rewrite`)
      .set(adminHeaders)
      .send({
        originalText: 'Great 3-day beginner fat loss program with dumbbells.',
      })
      .expect(201);

    const liveHealth = await api.get(prefix + '/health').expect(200);
    expect(typeof liveHealth.body.uptimeSeconds).toBe('number');

    const probe = await api
      .post(prefix + '/admin/analytics/uptime-check')
      .set(adminHeaders)
      .expect(200);
    expect(probe.body.database.ok).toBe(true);
    expect(probe.body.aiService.status).toBe('UP');

    const overview = await api
      .get(prefix + '/admin/analytics/overview?days=30')
      .set(adminHeaders)
      .expect(200);
    expect(
      overview.body.geminiUsage.summary.totalRequests,
    ).toBeGreaterThanOrEqual(1);
    expect(
      overview.body.geminiUsage.summary.totalInputTokens,
    ).toBeGreaterThanOrEqual(600);
    expect(
      overview.body.geminiUsage.summary.totalOutputTokens,
    ).toBeGreaterThanOrEqual(150);
    expect(
      overview.body.geminiUsage.summary.totalTokens,
    ).toBeGreaterThanOrEqual(750);
    expect(overview.body.geminiUsage.summary.estimatedCostUsd).toBeGreaterThan(
      0,
    );
    expect(overview.body.geminiUsage.byOperation[0].operation).toBe(
      'PROGRAM_HINTS_REWRITE',
    );
    expect(overview.body.uptime.liveStatus.aiService.status).toBe('UP');
    expect(
      overview.body.uptime.availability24h.totalChecks,
    ).toBeGreaterThanOrEqual(1);
  });

  it('serves Swagger UI with Customer and Admin OpenAPI definition selector', async () => {
    const html = await api.get(prefix + '/docs').expect(200);
    expect(html.text).toContain('swagger-ui');
    expect(html.text).toContain('/api/v1/docs/swagger-init.js');

    const initJs = await api.get(prefix + '/docs/swagger-init.js').expect(200);
    expect(initJs.text).toContain('Customer (Mobile App)');
    expect(initJs.text).toContain('Admin (Studio & Operations)');

    const customerSpec = await api
      .get(prefix + '/docs/customer.json')
      .expect(200);
    expect(customerSpec.body.openapi).toBe('3.0.3');
    expect(Object.keys(customerSpec.body.paths)).toContain('/auth/login');
    expect(Object.keys(customerSpec.body.paths)).toContain('/me/dashboard');
    expect(
      Object.keys(customerSpec.body.paths).some((p) => p.startsWith('/admin')),
    ).toBe(false);

    const adminSpec = await api.get(prefix + '/docs/admin.json').expect(200);
    expect(adminSpec.body.openapi).toBe('3.0.3');
    expect(Object.keys(adminSpec.body.paths)).toContain(
      '/admin/analytics/overview',
    );
    expect(Object.keys(adminSpec.body.paths)).toContain('/admin/programs');
  });
});
