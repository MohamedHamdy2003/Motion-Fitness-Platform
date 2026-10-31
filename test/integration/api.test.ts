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
    `TRUNCATE users CASCADE; TRUNCATE account_deletions,rate_limits;`,
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
      await runner.query(
        `INSERT INTO idempotency_keys(user_id,scope,key,body_hash,resource_id) VALUES($1,'measurement','legacy-fat-only','fixture-hash',$2)`,
        [user.user.id, removedId],
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
      expect(
        await runner.query(
          `SELECT key FROM idempotency_keys WHERE resource_id=$1`,
          [removedId],
        ),
      ).toEqual([]);
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
      .send({ email: 'x'.repeat(40000), password });
    expect(oversized.status, oversized.text).toBe(413);
    expect(oversized.body).toHaveProperty('requestId');
  });
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
      (
        await api
          .post(prefix + '/auth/verify-email')
          .send({ email: 'athlete@example.test', code: value })
      ).status,
    ).toBe(200);
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
      RESET_LINK_BASE: 'https://client.example.test/reset',
      VERIFY_LINK_BASE: 'https://client.example.test/verify',
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
          .send({ expectedRevision: 0, avatar_media_id: id })
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
      .send({ expectedRevision: 0, date_of_birth: '2020-01-01' });
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
      height_cm: 175,
      primary_goal: 'FAT_LOSS',
      fitness_level: 'BEGINNER',
      training_days_per_week: 3,
      timezone: 'Africa/Cairo',
      locale: 'ar',
      date_of_birth: '1998-03-14',
      expectedRevision: 0,
      weight_kg: 80,
    };
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
    const [saved] = await db.query(
      'SELECT weight_kg,profile_revision FROM user_profiles WHERE user_id=$1',
      [r.user.id],
    );
    expect(Number(saved.weight_kg)).toBe(80);
    expect(saved.profile_revision).toBe(1);
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
  it('replaces current weight without dates/history and rejects stale or legacy writes', async () => {
    const user = await register();
    const headers = bearer(user.accessToken);
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(headers)
          .send({ expectedRevision: 0, weight_kg: 80 })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(headers)
          .send({ expectedRevision: 0, weight_kg: 81 })
      ).status,
    ).toBe(409);
    expect(
      (
        await api
          .patch(prefix + '/me')
          .set(headers)
          .send({ expectedRevision: 1, weight_kg: 82 })
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
            .send({ expectedRevision: 2, weight_kg: 83, ...extra })
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

describe('F03 content library', () => {
  it('denies athletes and preserves published revisions with optimistic concurrency', async () => {
    const account = await register();
    const headers = bearer(account.accessToken);
    expect(
      (await api.get(prefix + '/admin/exercises').set(headers)).status,
    ).toBe(403);
    const [user] = await db.query(
      `SELECT id FROM users WHERE email_normalized='athlete@example.test'`,
    );
    await db.query(`INSERT INTO user_roles VALUES($1,'CONTENT_EDITOR')`, [
      user.id,
    ]);
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
      .send({ expectedRevision: 1 });
    expect(published.status, published.text).toBe(201);
    expect(
      (
        await api
          .patch(prefix + `/admin/exercises/${id}`)
          .set(headers)
          .send({ expectedRevision: 1, content })
      ).status,
    ).toBe(409);
    const changed = await api
      .patch(prefix + `/admin/exercises/${id}`)
      .set(headers)
      .send({
        expectedRevision: 2,
        content: { ...content, title: 'New fixture' },
      });
    expect(changed.status, changed.text).toBe(200);
    const read = await api.get(prefix + `/admin/exercises/${id}`).set(headers);
    expect(read.body.versions).toHaveLength(2);
    expect(read.body.versions[1].content.title).toBe('Fixture exercise');
    await expect(
      db.query(`UPDATE exercise_revisions SET content='{}' WHERE id=$1`, [
        created.body.id,
      ]),
    ).rejects.toThrow('Published content is immutable');
    await db.query(
      `DELETE FROM user_roles WHERE user_id=$1 AND role_code='CONTENT_EDITOR'`,
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
          .send({ expectedRevision: 1 })
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

it('limits OTP guesses, expires codes and invalidates older codes on resend', async () => {
  await register();
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
  await register();
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
