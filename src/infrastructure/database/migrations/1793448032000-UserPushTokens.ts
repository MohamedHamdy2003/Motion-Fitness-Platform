import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPushTokens1793448032000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE user_push_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        platform text NOT NULL CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
        device_id text,
        app_version text,
        locale text,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX user_push_tokens_user_idx
        ON user_push_tokens(user_id, updated_at DESC);
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`
      DROP INDEX IF EXISTS user_push_tokens_user_idx;
      DROP TABLE IF EXISTS user_push_tokens;
    `);
  }
}
