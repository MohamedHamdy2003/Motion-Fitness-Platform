import { MigrationInterface, QueryRunner } from 'typeorm';
export class AvatarUploadKeys1793318401000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE media_assets ADD COLUMN upload_key text; UPDATE media_assets SET upload_key=storage_key; ALTER TABLE media_assets ALTER COLUMN upload_key SET NOT NULL;`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE media_assets DROP COLUMN upload_key;`);
  }
}
