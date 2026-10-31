import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { MediaService } from '../../src/modules/media/media.service';
import { databaseOptions } from '../../src/infrastructure/database/database.options';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
beforeEach(() => {
  for (const [key, value] of Object.entries({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://fixture:fixture@localhost/fixture_test',
    DATABASE_SSL: 'false',
    DATABASE_CA_CERT_PATH: '',
    JWT_SECRET: 'fixture-signing-key-at-least-32-characters',
    MAIL_MODE: 'disabled',
    S3_AUTH_MODE: 'iam',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'fixture-bucket',
    S3_ENDPOINT: '',
    S3_ACCESS_KEY_ID: '',
    S3_SECRET_ACCESS_KEY: '',
    AWS_ACCESS_KEY_ID: 'fixture-chain-key',
    AWS_SECRET_ACCESS_KEY: 'fixture-chain-secret',
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
describe('AWS deployment configuration', () => {
  it('uses the AWS credential chain without custom endpoint or static S3 keys', async () => {
    const client = new MediaService({} as DataSource).client();
    try {
      expect((await client.config.credentials()).accessKeyId).toBe(
        'fixture-chain-key',
      );
      expect(await client.config.region()).toBe('us-east-1');
    } finally {
      client.destroy();
    }
  });
  it('keeps explicit static credentials for compatible storage and rejects incomplete settings', async () => {
    vi.stubEnv('S3_AUTH_MODE', 'static');
    const service = new MediaService({} as DataSource);
    expect(() => service.client()).toThrow('STORAGE_NOT_CONFIGURED');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'fixture-explicit');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'fixture-secret');
    const client = service.client();
    try {
      expect((await client.config.credentials()).accessKeyId).toBe(
        'fixture-explicit',
      );
    } finally {
      client.destroy();
    }
  });
  it('preserves verified TLS and custom CA even with conflicting URL SSL options', () => {
    const dir = mkdtempSync(join(tmpdir(), 'motion-ca-'));
    const file = join(dir, 'ca.pem');
    try {
      writeFileSync(file, 'fixture-ca');
      vi.stubEnv('DATABASE_SSL', 'true');
      vi.stubEnv('DATABASE_CA_CERT_PATH', file);
      vi.stubEnv(
        'DATABASE_URL',
        'postgres://fixture:fixture@localhost/fixture_test?sslmode=no-verify',
      );
      const options = databaseOptions() as { url: string; ssl: unknown };
      expect(options.ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'fixture-ca',
      });
      expect(new URL(options.url).searchParams.has('sslmode')).toBe(false);
    } finally {
      unlinkSync(file);
      rmdirSync(dir);
    }
  });
});
