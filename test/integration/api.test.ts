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
const register = async (email = 'athlete@example.test') => {
  const r = await api.post(prefix + '/auth/register').send({ email, password });
  expect(r.status, r.text).toBe(201);
  return r.body;
};
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
async function capturedToken(email: string) {
  const [r] = await db.query(
    `SELECT j.payload FROM jobs j JOIN users u ON u.id=j.user_id WHERE u.email_normalized=$1 ORDER BY j.created_at DESC LIMIT 1`,
    [email],
  );
  const mail = JSON.parse(
    decrypt(r.payload.encrypted, process.env.MAIL_ENCRYPTION_KEY!),
  );
  return new URL(mail.text).searchParams.get('token')!;
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
    MINIMUM_AGE: '18',
    BODY_FAT_METHODS: 'SELF_REPORTED,BIA',
    MEASUREMENT_MAX_AGE_DAYS: '90',
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
  await db.undoLastMigration();
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
    `TRUNCATE users CASCADE; TRUNCATE account_deletions,rate_limits;`,
  );
  Object.assign(process.env, {
    GOOGLE_CLIENT_IDS: '',
    MAIL_MODE: 'capture',
    MINIMUM_AGE: '18',
    MEASUREMENT_MAX_AGE_DAYS: '90',
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
  it('runs reversible migrations and transactional, idempotent lookup seeds', async () => {
    await seedLookups(db);
    const before = await db.query('SELECT * FROM body_areas ORDER BY code');
    await seedLookups(db);
    expect(await db.query('SELECT * FROM body_areas ORDER BY code')).toEqual(
      before,
    );
    await seedContent(db);
    await seedContent(db);
    expect((await db.query('SELECT count(*)::int AS n FROM users'))[0].n).toBe(
      0,
    );
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
    const r = await register();
    expect(r.tokenType).toBe('Bearer');
    const [u] = await db.query('SELECT * FROM users');
    expect(u.password_hash).not.toContain(password);
    expect(u.password_hash).toContain('$argon2id$');
    const [t] = await db.query('SELECT * FROM auth_refresh_tokens');
    expect(t.token_hash).toBe(hash(r.refreshToken));
    const value = await capturedToken('athlete@example.test');
    expect(
      (await api.post(prefix + '/auth/verify-email').send({ token: value }))
        .status,
    ).toBe(200);
    expect(
      (await api.post(prefix + '/auth/verify-email').send({ token: value }))
        .status,
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
describe('profiles, onboarding and injuries', () => {
  it('gates unresolved onboarding policy; idempotent onboarding records one weight and honest matching state', async () => {
    const r = await register();
    const input = {
      name: 'Athlete',
      height_cm: 175,
      primary_goal: 'FAT_LOSS',
      fitness_level: 'BEGINNER',
      training_days_per_week: 3,
      timezone: 'Africa/Cairo',
      locale: 'ar',
      date_of_birth: '1998-03-14',
      expectedRevision: 0,
      initialMeasurement: {
        weight_kg: 80,
        measured_at: new Date().toISOString(),
      },
    };
    process.env.MINIMUM_AGE = '';
    expect(
      (
        await api
          .put(prefix + '/me/onboarding')
          .set(bearer(r.accessToken))
          .set('idempotency-key', 'onboarding-test')
          .send(input)
      ).body.code,
    ).toBe('ONBOARDING_POLICY_NOT_CONFIGURED');
    process.env.MINIMUM_AGE = '18';
    const first = await api
      .put(prefix + '/me/onboarding')
      .set(bearer(r.accessToken))
      .set('idempotency-key', 'onboarding-test')
      .send(input);
    expect(first.status, first.text).toBe(200);
    expect(first.body.matching.status).toBe('PENDING');
    expect(
      (
        await api
          .put(prefix + '/me/onboarding')
          .set(bearer(r.accessToken))
          .set('idempotency-key', 'onboarding-test')
          .send(input)
      ).status,
    ).toBe(200);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM body_measurements'))[0].n,
    ).toBe(1);
  });
  it('atomically rejects concurrent profile revisions and unauthorized fields', async () => {
    const r = await register();
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(bearer(r.accessToken))
          .send({ expectedRevision: 0, role: 'ADMIN' })
      ).status,
    ).toBe(400);
    const responses = await Promise.all([
      api
        .patch(prefix + '/me')
        .set(bearer(r.accessToken))
        .send({ expectedRevision: 0, name: 'First' }),
      api
        .patch(prefix + '/me')
        .set(bearer(r.accessToken))
        .send({ expectedRevision: 0, name: 'Second' }),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 409]);
  });
  it('stores independent latest weight/body-fat observations and rejects conflicting idempotency keys', async () => {
    const r = await register();
    const header = bearer(r.accessToken);
    const weight = { weight_kg: 80, measured_at: '2026-01-02T00:00:00Z' };
    expect(
      (
        await api
          .post(prefix + '/me/measurements')
          .set(header)
          .set('idempotency-key', 'weight-test')
          .send(weight)
      ).status,
    ).toBe(201);
    expect(
      (
        await api
          .post(prefix + '/me/measurements')
          .set(header)
          .set('idempotency-key', 'weight-test')
          .send(weight)
      ).status,
    ).toBe(201);
    expect(
      (
        await api
          .post(prefix + '/me/measurements')
          .set(header)
          .set('idempotency-key', 'weight-test')
          .send({ ...weight, weight_kg: 81 })
      ).status,
    ).toBe(409);
    expect(
      (
        await api
          .post(prefix + '/me/measurements')
          .set(header)
          .set('idempotency-key', 'fat-test')
          .send({
            body_fat_percent: 21,
            body_fat_method: 'BIA',
            measured_at: '2026-01-03T00:00:00Z',
          })
      ).status,
    ).toBe(201);
    const me = await api.get(prefix + '/me').set(header);
    expect(Number(me.body.latest_weight.weight_kg)).toBe(80);
    expect(Number(me.body.latest_body_fat.body_fat_percent)).toBe(21);
    expect(me.body.latest_weight.id).not.toBe(me.body.latest_body_fat.id);
  });
  it('requires explicit confirmation; prevents cross-user edits and stale concurrent injury updates', async () => {
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
          .set('idempotency-key', 'injury-test')
          .send({ ...input, confirmed: false })
      ).status,
    ).toBe(400);
    const added = await api
      .post(prefix + '/me/injuries')
      .set(bearer(r.accessToken))
      .set('idempotency-key', 'injury-test')
      .send(input);
    expect(added.status, added.text).toBe(201);
    const id = added.body.injury.id;
    expect(
      (
        await api
          .patch(prefix + '/me/injuries/' + id)
          .set(bearer(other.accessToken))
          .send({ ...input, expectedVersion: 1 })
      ).status,
    ).toBe(404);
    const responses = await Promise.all([
      api
        .patch(prefix + '/me/injuries/' + id)
        .set(bearer(r.accessToken))
        .send({
          ...input,
          description: 'Edited final description A',
          expectedVersion: 1,
        }),
      api
        .patch(prefix + '/me/injuries/' + id)
        .set(bearer(r.accessToken))
        .send({
          ...input,
          description: 'Edited final description B',
          expectedVersion: 1,
        }),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(
      (
        await api
          .delete(prefix + '/me/injuries/' + id)
          .set(bearer(r.accessToken))
          .send({ expectedVersion: 2, confirmed: true })
      ).status,
    ).toBe(200);
    const me = await api.get(prefix + '/me').set(bearer(r.accessToken));
    expect(me.body.injuries).toEqual([]);
    expect(me.body.injury_revision).toBe(3);
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
  it('preferences validate references, roll back errors and maintain an independent revision', async () => {
    const r = await register();
    const input = {
      expectedRevision: 0,
      allergen_codes: ['MILK'],
      disliked_food_ids: [],
      excluded_food_ids: [],
    };
    expect(
      (
        await api
          .put(prefix + '/me/food-preferences')
          .set(bearer(r.accessToken))
          .send({ ...input, allergen_codes: ['INVENTED'] })
      ).status,
    ).toBe(400);
    const saved = await api
      .put(prefix + '/me/food-preferences')
      .set(bearer(r.accessToken))
      .send(input);
    expect(saved.status, saved.text).toBe(200);
    expect(saved.body.revision).toBe(1);
    expect(
      (
        await api
          .put(prefix + '/me/food-preferences')
          .set(bearer(r.accessToken))
          .send(input)
      ).status,
    ).toBe(409);
    const me = await api.get(prefix + '/me').set(bearer(r.accessToken));
    expect(me.body.injury_revision).toBe(0);
    expect(me.body.food_preferences.allergen_codes).toEqual(['MILK']);
  });
  it('settings are versioned and media fails honestly when storage is unavailable', async () => {
    const r = await register();
    expect(
      (
        await api
          .patch(prefix + '/me/settings')
          .set(bearer(r.accessToken))
          .send({
            expectedVersion: 0,
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
          .send({ expectedVersion: 0, reminders: true })
      ).status,
    ).toBe(409);
    const upload = await api
      .post(prefix + '/media/upload-intents')
      .set(bearer(r.accessToken))
      .send({ mime: 'image/png', size: 123 });
    expect(upload.body.code).toBe('STORAGE_NOT_CONFIGURED');
  });
});
