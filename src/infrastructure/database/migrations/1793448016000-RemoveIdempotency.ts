import { MigrationInterface, QueryRunner } from 'typeorm';
export class RemoveIdempotency1793448016000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS idempotency_keys CASCADE');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE idempotency_keys(user_id uuid REFERENCES users ON DELETE CASCADE,scope text NOT NULL,key text NOT NULL,body_hash text NOT NULL,resource_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,scope,key))`,
    );
  }
}
