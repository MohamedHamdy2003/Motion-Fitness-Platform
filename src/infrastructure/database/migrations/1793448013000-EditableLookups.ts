import { MigrationInterface, QueryRunner } from 'typeorm';

export class EditableLookups1793448013000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE roles
        ADD COLUMN label text NOT NULL DEFAULT '',
        ADD COLUMN display_order integer NOT NULL DEFAULT 0,
        ADD COLUMN active boolean NOT NULL DEFAULT true;
      WITH ranked AS (
        SELECT code,row_number() OVER(ORDER BY code)::integer AS position FROM roles
      )
      UPDATE roles r SET label=initcap(replace(lower(r.code),'_',' ')),display_order=ranked.position
      FROM ranked WHERE ranked.code=r.code;
      ALTER TABLE roles ALTER COLUMN label DROP DEFAULT, ALTER COLUMN display_order DROP DEFAULT;

      ALTER TABLE genders
        ADD COLUMN label text NOT NULL DEFAULT '',
        ADD COLUMN display_order integer NOT NULL DEFAULT 0,
        ADD COLUMN active boolean NOT NULL DEFAULT true;
      WITH ranked AS (
        SELECT code,row_number() OVER(ORDER BY code)::integer AS position FROM genders
      )
      UPDATE genders g SET label=initcap(replace(lower(g.code),'_',' ')),display_order=ranked.position
      FROM ranked WHERE ranked.code=g.code;
      ALTER TABLE genders ALTER COLUMN label DROP DEFAULT, ALTER COLUMN display_order DROP DEFAULT;

      ALTER TABLE allergens
        ADD COLUMN display_order integer NOT NULL DEFAULT 0,
        ADD COLUMN active boolean NOT NULL DEFAULT true;
      WITH ranked AS (
        SELECT code,row_number() OVER(ORDER BY code)::integer AS position FROM allergens
      )
      UPDATE allergens a SET display_order=ranked.position
      FROM ranked WHERE ranked.code=a.code;
      ALTER TABLE allergens ALTER COLUMN display_order DROP DEFAULT;

      ALTER TABLE body_areas_injuries
        ADD COLUMN label text NOT NULL DEFAULT '',
        ADD COLUMN display_order integer NOT NULL DEFAULT 0,
        ADD COLUMN active boolean NOT NULL DEFAULT true;
      WITH ranked AS (
        SELECT code,row_number() OVER(ORDER BY code)::integer AS position FROM body_areas_injuries
      )
      UPDATE body_areas_injuries a
      SET label=initcap(replace(lower(a.code),'_',' ')),display_order=ranked.position
      FROM ranked WHERE ranked.code=a.code;
      ALTER TABLE body_areas_injuries ALTER COLUMN label DROP DEFAULT, ALTER COLUMN display_order DROP DEFAULT;

      ALTER TABLE primary_goals ADD COLUMN active boolean NOT NULL DEFAULT true;
      ALTER TABLE fitness_levels ADD COLUMN active boolean NOT NULL DEFAULT true;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE roles DROP COLUMN active,DROP COLUMN display_order,DROP COLUMN label;
      ALTER TABLE genders DROP COLUMN active,DROP COLUMN display_order,DROP COLUMN label;
      ALTER TABLE allergens DROP COLUMN active,DROP COLUMN display_order;
      ALTER TABLE body_areas_injuries DROP COLUMN active,DROP COLUMN display_order,DROP COLUMN label;
      ALTER TABLE primary_goals DROP COLUMN active;
      ALTER TABLE fitness_levels DROP COLUMN active;
    `);
  }
}
