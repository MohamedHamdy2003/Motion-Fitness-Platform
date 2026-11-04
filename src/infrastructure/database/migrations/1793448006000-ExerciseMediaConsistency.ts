import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExerciseMediaConsistency1793448006000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE exercise_revisions
        ADD CONSTRAINT exercise_revision_media_consistent
        CHECK(content->>'mediaId' IS NOT DISTINCT FROM media_id::text);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE exercise_revisions DROP CONSTRAINT exercise_revision_media_consistent;`,
    );
  }
}
