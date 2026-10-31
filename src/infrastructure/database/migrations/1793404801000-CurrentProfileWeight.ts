import { MigrationInterface, QueryRunner } from 'typeorm';

export class CurrentProfileWeight1793404801000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weight_kg numeric CHECK(weight_kg>0);
      UPDATE user_profiles p SET weight_kg=(
        SELECT m.weight_kg FROM body_measurements m WHERE m.user_id=p.user_id
        ORDER BY m.measured_at DESC,m.created_at DESC,m.id DESC LIMIT 1
      ),profile_revision=profile_revision+1
      WHERE EXISTS(SELECT 1 FROM body_measurements m WHERE m.user_id=p.user_id);
      DELETE FROM idempotency_keys WHERE scope IN ('measurement','onboarding');
      DROP TABLE body_measurements;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // Preserve current profile weight. Old dates/history cannot be reconstructed.
    await q.query(`
      CREATE TABLE body_measurements(
        id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
        measured_at timestamptz NOT NULL,weight_kg numeric NOT NULL CHECK(weight_kg>0),
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX measurements_user_date ON body_measurements(user_id,measured_at DESC,id);
    `);
  }
}
