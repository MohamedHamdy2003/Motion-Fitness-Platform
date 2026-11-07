import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameBodyAreasInjuries1793448012000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE body_areas RENAME TO body_areas_injuries`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE body_areas_injuries RENAME TO body_areas`);
  }
}
