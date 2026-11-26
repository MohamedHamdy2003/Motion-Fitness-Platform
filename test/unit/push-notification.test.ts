import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import {
  buildFcmMessage,
  isUnregisteredFcmError,
  PushNotificationService,
  resolveFcmCredentials,
} from '../../src/modules/notifications/push-notification.service';

const testKeyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const savedEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  FCM_SERVICE_ACCOUNT_BASE64: process.env.FCM_SERVICE_ACCOUNT_BASE64,
  FCM_PROJECT_ID: process.env.FCM_PROJECT_ID,
  FCM_CLIENT_EMAIL: process.env.FCM_CLIENT_EMAIL,
  FCM_PRIVATE_KEY: process.env.FCM_PRIVATE_KEY,
};

function setTestEnv(overrides: Record<string, string>) {
  process.env.DATABASE_URL =
    'postgres://motion:test@localhost:5432/motion_test';
  process.env.JWT_SECRET = 'a'.repeat(48);
  process.env.FCM_SERVICE_ACCOUNT_BASE64 = '';
  process.env.FCM_PROJECT_ID = '';
  process.env.FCM_CLIENT_EMAIL = '';
  process.env.FCM_PRIVATE_KEY = '';
  Object.assign(process.env, overrides);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('PushNotificationService & FCM HTTP v1 helpers', () => {
  it('resolves credentials from base64 service account JSON or separate env vars', () => {
    const rawJson = JSON.stringify({
      project_id: 'motion-prod-123',
      client_email: 'firebase-adminsdk@motion-prod-123.iam.gserviceaccount.com',
      private_key: testKeyPair.privateKey,
    });
    const base64 = Buffer.from(rawJson, 'utf8').toString('base64');

    const fromBase64 = resolveFcmCredentials({
      FCM_SERVICE_ACCOUNT_BASE64: base64,
      FCM_PROJECT_ID: '',
      FCM_CLIENT_EMAIL: '',
      FCM_PRIVATE_KEY: '',
    });
    expect(fromBase64).toEqual({
      projectId: 'motion-prod-123',
      clientEmail: 'firebase-adminsdk@motion-prod-123.iam.gserviceaccount.com',
      privateKey: testKeyPair.privateKey.trim(),
    });

    const fromSplit = resolveFcmCredentials({
      FCM_SERVICE_ACCOUNT_BASE64: '',
      FCM_PROJECT_ID: 'motion-split-456',
      FCM_CLIENT_EMAIL: 'bot@motion-split-456.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: testKeyPair.privateKey.replace(/\n/g, '\\n'),
    });
    expect(fromSplit).toEqual({
      projectId: 'motion-split-456',
      clientEmail: 'bot@motion-split-456.iam.gserviceaccount.com',
      privateKey: testKeyPair.privateKey.trim(),
    });

    expect(
      resolveFcmCredentials({
        FCM_SERVICE_ACCOUNT_BASE64: 'not-valid-base64-json',
        FCM_PROJECT_ID: '',
        FCM_CLIENT_EMAIL: '',
        FCM_PRIVATE_KEY: '',
      }),
    ).toBeNull();
  });

  it('builds valid FCM HTTP v1 message with stringified data and Android/APNs fields', () => {
    const built = buildFcmMessage('device-token-abc1234567890', {
      id: 'notif-1',
      type: 'PROGRAM_READY',
      title: 'Your program is ready',
      body: 'Your Push Pull Legs schedule is ready.',
      payload: {
        enrollmentId: 'enroll-9',
        weightKg: 78.5,
        from: 'reserved-should-be-dropped',
        'google.internal': 'drop-me',
        nested: { ignoreFlat: true },
      },
    });

    expect(built.message.token).toBe('device-token-abc1234567890');
    expect(built.message.notification).toEqual({
      title: 'Your program is ready',
      body: 'Your Push Pull Legs schedule is ready.',
    });
    expect(built.message.data.notificationId).toBe('notif-1');
    expect(built.message.data.type).toBe('PROGRAM_READY');
    expect(built.message.data.enrollmentId).toBe('enroll-9');
    expect(built.message.data.weightKg).toBe('78.5');
    expect(built.message.data).not.toHaveProperty('from');
    expect(built.message.data).not.toHaveProperty('google.internal');
    expect(JSON.parse(built.message.data.payloadJson)).toMatchObject({
      enrollmentId: 'enroll-9',
      nested: { ignoreFlat: true },
    });
    expect(built.message.android.priority).toBe('high');
    expect(built.message.apns.payload.aps.sound).toBe('default');
  });

  it('detects unregistered and invalid registration token responses accurately', () => {
    expect(
      isUnregisteredFcmError(404, {
        error: {
          status: 'NOT_FOUND',
          details: [
            {
              '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
              errorCode: 'UNREGISTERED',
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      isUnregisteredFcmError(400, {
        error: {
          status: 'INVALID_ARGUMENT',
          message:
            'The registration token is not a valid FCM registration token',
        },
      }),
    ).toBe(true);

    expect(
      isUnregisteredFcmError(500, {
        error: {
          status: 'INTERNAL',
          message: 'Transient server error',
        },
      }),
    ).toBe(false);
  });

  it('caches OAuth2 access tokens, dispatches to devices, and deletes UNREGISTERED tokens', async () => {
    const serviceAccountBase64 = Buffer.from(
      JSON.stringify({
        project_id: 'motion-unit-test',
        client_email: 'fcm@motion-unit-test.iam.gserviceaccount.com',
        private_key: testKeyPair.privateKey,
      }),
      'utf8',
    ).toString('base64');
    setTestEnv({ FCM_SERVICE_ACCOUNT_BASE64: serviceAccountBase64 });

    const dbQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT token')) {
        return [
          { token: 'valid-token-1111111111111' },
          { token: 'stale-token-2222222222222' },
        ];
      }
      if (sql.includes('DELETE FROM user_push_tokens')) {
        expect(params).toEqual([['stale-token-2222222222222']]);
        return [{ id: 'deleted-row-id' }];
      }
      return [];
    });
    const fakeDb = { query: dbQuery } as unknown as DataSource;

    let oauthCalls = 0;
    const fcmCalls: Array<{ url: string; token: string; auth: string | null }> =
      [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://oauth2.googleapis.com/token') {
          oauthCalls += 1;
          return new Response(
            JSON.stringify({
              access_token: 'ya29.mock-access-token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        const payload = JSON.parse(String(init?.body ?? '{}')) as {
          message: { token: string };
        };
        const headers = new Headers(init?.headers);
        fcmCalls.push({
          url,
          token: payload.message.token,
          auth: headers.get('authorization'),
        });

        if (payload.message.token === 'stale-token-2222222222222') {
          return new Response(
            JSON.stringify({
              error: {
                code: 404,
                status: 'NOT_FOUND',
                details: [{ errorCode: 'UNREGISTERED' }],
              },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({ name: 'projects/motion-unit-test/messages/123' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const service = new PushNotificationService(fakeDb);
    expect(service.isConfigured()).toBe(true);

    const first = await service.sendToUser('user-1', {
      id: 'notif-100',
      type: 'CHECKIN_COMPLETED',
      title: 'Check-in recorded',
      body: 'Great consistency this week!',
      payload: { checkInId: 'ci-1' },
    });

    expect(first).toEqual({
      configured: true,
      attempted: 2,
      sent: 1,
      failed: 1,
      removed: 1,
    });
    expect(oauthCalls).toBe(1);
    expect(fcmCalls).toHaveLength(2);
    expect(fcmCalls[0].url).toBe(
      'https://fcm.googleapis.com/v1/projects/motion-unit-test/messages:send',
    );
    expect(fcmCalls[0].auth).toBe('Bearer ya29.mock-access-token');

    // Second send reuses cached OAuth2 token without hitting oauth2.googleapis.com again.
    await service.sendToUser('user-1', {
      id: 'notif-101',
      type: 'PROGRAM_READY',
      title: 'Program ready',
      body: 'Ready now',
    });
    expect(oauthCalls).toBe(1);
  });

  it('skips cleanly when FCM credentials are not configured', async () => {
    setTestEnv({});
    const dbQuery = vi.fn();
    const service = new PushNotificationService({
      query: dbQuery,
    } as unknown as DataSource);

    expect(service.isConfigured()).toBe(false);
    const result = await service.sendToUser('user-1', {
      id: 'notif-200',
      type: 'SYSTEM',
      title: 'Hello',
      body: 'World',
    });
    expect(result).toEqual({
      configured: false,
      attempted: 0,
      sent: 0,
      failed: 0,
      removed: 0,
    });
    expect(dbQuery).not.toHaveBeenCalled();
  });
});
