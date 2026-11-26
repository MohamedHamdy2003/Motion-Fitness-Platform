import { Inject, Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { DataSource } from 'typeorm';
import { environment, Environment } from '../../config/environment';
import { query } from '../../infrastructure/database/query';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_OAUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const MAX_DEVICES_PER_USER = 20;
const REQUEST_TIMEOUT_MS = 5000;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

const RESERVED_FCM_DATA_KEYS = new Set([
  'from',
  'notification',
  'message_type',
  'collapse_key',
]);

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface PushNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
}

export interface PushDeliverySummary {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  removed: number;
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function resolveFcmCredentials(
  env: Pick<
    Environment,
    | 'FCM_SERVICE_ACCOUNT_BASE64'
    | 'FCM_PROJECT_ID'
    | 'FCM_CLIENT_EMAIL'
    | 'FCM_PRIVATE_KEY'
  >,
): FcmCredentials | null {
  const encoded = env.FCM_SERVICE_ACCOUNT_BASE64.trim();
  if (encoded) {
    try {
      const jsonText = encoded.startsWith('{')
        ? encoded
        : Buffer.from(encoded, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonText) as {
        project_id?: unknown;
        client_email?: unknown;
        private_key?: unknown;
      };
      const projectId =
        typeof parsed.project_id === 'string' ? parsed.project_id.trim() : '';
      const clientEmail =
        typeof parsed.client_email === 'string'
          ? parsed.client_email.trim()
          : '';
      const privateKey =
        typeof parsed.private_key === 'string'
          ? normalizePrivateKey(parsed.private_key)
          : '';
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
      return null;
    } catch {
      return null;
    }
  }

  const projectId = env.FCM_PROJECT_ID.trim();
  const clientEmail = env.FCM_CLIENT_EMAIL.trim();
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

function flattenPayloadForFcmData(
  payload?: Record<string, unknown> | null,
): Record<string, string> {
  const flat: Record<string, string> = {};
  if (!payload || typeof payload !== 'object') return flat;
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    const lower = key.toLowerCase();
    if (
      RESERVED_FCM_DATA_KEYS.has(lower) ||
      lower.startsWith('google.') ||
      lower.startsWith('gcm.')
    ) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      flat[key] = String(value);
    }
  }
  return flat;
}

export function buildFcmMessage(
  token: string,
  notification: PushNotificationPayload,
) {
  const data: Record<string, string> = {
    ...flattenPayloadForFcmData(notification.payload),
    notificationId: notification.id,
    type: notification.type,
    payloadJson: JSON.stringify(notification.payload ?? {}),
  };

  return {
    message: {
      token,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data,
      android: {
        priority: 'high',
        notification: {
          channel_id: 'motion_general',
          sound: 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    },
  };
}

export function isUnregisteredFcmError(status: number, body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return status === 404;
  }
  const err = (body as { error?: Record<string, unknown> }).error;
  if (!err || typeof err !== 'object') {
    return status === 404;
  }
  const details = Array.isArray(err.details) ? err.details : [];
  for (const detail of details) {
    if (detail && typeof detail === 'object') {
      const errorCode = (detail as { errorCode?: unknown }).errorCode;
      if (errorCode === 'UNREGISTERED' || errorCode === 'SENDER_ID_MISMATCH') {
        return true;
      }
    }
  }
  if (status === 404 && err.status === 'NOT_FOUND') {
    return true;
  }
  if (
    status === 400 &&
    err.status === 'INVALID_ARGUMENT' &&
    typeof err.message === 'string' &&
    err.message.toLowerCase().includes('registration token')
  ) {
    return true;
  }
  return false;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private cachedCredentialKey = '';
  private cachedCredentials: FcmCredentials | null = null;
  private cachedAccessToken: {
    token: string;
    expiresAtMs: number;
    credentialKey: string;
  } | null = null;
  private pendingAccessToken: Promise<string> | null = null;

  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private getCredentials(): { key: string; creds: FcmCredentials | null } {
    const env = environment();
    const key = [
      env.FCM_SERVICE_ACCOUNT_BASE64,
      env.FCM_PROJECT_ID,
      env.FCM_CLIENT_EMAIL,
      env.FCM_PRIVATE_KEY,
    ].join('|');
    if (key !== this.cachedCredentialKey) {
      this.cachedCredentialKey = key;
      this.cachedCredentials = resolveFcmCredentials(env);
      this.cachedAccessToken = null;
      this.pendingAccessToken = null;
    }
    return { key, creds: this.cachedCredentials };
  }

  isConfigured(): boolean {
    return this.getCredentials().creds !== null;
  }

  private signServiceAccountJwt(creds: FcmCredentials, nowSec: number): string {
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: creds.clientEmail,
        scope: FCM_OAUTH_SCOPE,
        aud: GOOGLE_OAUTH_TOKEN_URL,
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = base64Url(signer.sign(creds.privateKey));
    return `${signingInput}.${signature}`;
  }

  private async getAccessToken(
    credentialKey: string,
    creds: FcmCredentials,
  ): Promise<string> {
    if (
      this.cachedAccessToken &&
      this.cachedAccessToken.credentialKey === credentialKey &&
      Date.now() < this.cachedAccessToken.expiresAtMs - TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.cachedAccessToken.token;
    }

    if (this.pendingAccessToken) {
      return this.pendingAccessToken;
    }

    const requestPromise = (async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const assertion = this.signServiceAccountJwt(creds, nowSec);
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      });

      const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `FCM OAuth token exchange failed (${response.status}): ${text.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!data.access_token) {
        throw new Error('FCM OAuth response missing access_token');
      }

      const expiresInSec =
        typeof data.expires_in === 'number' && data.expires_in > 0
          ? data.expires_in
          : 3600;
      this.cachedAccessToken = {
        token: data.access_token,
        expiresAtMs: Date.now() + expiresInSec * 1000,
        credentialKey,
      };
      return data.access_token;
    })();

    this.pendingAccessToken = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (this.pendingAccessToken === requestPromise) {
        this.pendingAccessToken = null;
      }
    }
  }

  dispatchAsync(userId: string, notification: PushNotificationPayload): void {
    void this.sendToUser(userId, notification).catch((error) => {
      this.logger.warn(
        `Async push dispatch failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async sendToUser(
    userId: string,
    notification: PushNotificationPayload,
  ): Promise<PushDeliverySummary> {
    const { key, creds } = this.getCredentials();
    if (!creds) {
      return {
        configured: false,
        attempted: 0,
        sent: 0,
        failed: 0,
        removed: 0,
      };
    }

    try {
      const devices = (await query(
        this.db,
        `SELECT token
         FROM user_push_tokens
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [userId, MAX_DEVICES_PER_USER],
      )) as Array<{ token: string }>;

      if (devices.length === 0) {
        return {
          configured: true,
          attempted: 0,
          sent: 0,
          failed: 0,
          removed: 0,
        };
      }

      const accessToken = await this.getAccessToken(key, creds);
      const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        creds.projectId,
      )}/messages:send`;

      let sent = 0;
      let failed = 0;
      const staleTokens: string[] = [];

      await Promise.all(
        devices.map(async ({ token }) => {
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify(buildFcmMessage(token, notification)),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (response.ok) {
              sent += 1;
              return;
            }

            failed += 1;
            const errorBody = await response.json().catch(() => null);
            if (isUnregisteredFcmError(response.status, errorBody)) {
              staleTokens.push(token);
            }
          } catch {
            failed += 1;
          }
        }),
      );

      let removed = 0;
      if (staleTokens.length > 0) {
        const deleted = await query(
          this.db,
          `DELETE FROM user_push_tokens
           WHERE token = ANY($1::text[])
           RETURNING id`,
          [staleTokens],
        );
        removed = deleted.length;
      }

      return {
        configured: true,
        attempted: devices.length,
        sent,
        failed,
        removed,
      };
    } catch (error) {
      this.logger.warn(
        `FCM delivery failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        configured: true,
        attempted: 0,
        sent: 0,
        failed: 1,
        removed: 0,
      };
    }
  }
}
