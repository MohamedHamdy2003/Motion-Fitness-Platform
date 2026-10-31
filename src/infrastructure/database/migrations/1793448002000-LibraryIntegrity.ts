import { MigrationInterface, QueryRunner } from 'typeorm';
export class LibraryIntegrity1793448002000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
 CREATE VIEW available_food_references AS SELECT r.* FROM food_reference_items r
 WHERE NOT EXISTS(SELECT 1 FROM ingredients i WHERE i.id=r.id AND i.archived)
 AND (NOT EXISTS(SELECT 1 FROM foods f WHERE f.id=r.id) OR EXISTS(SELECT 1 FROM foods f JOIN food_versions v ON v.food_id=f.id WHERE f.id=r.id AND NOT f.archived AND v.status='PUBLISHED'));
 CREATE FUNCTION protect_published_ingredients() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM food_versions WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.food_version_id ELSE NEW.food_version_id END AND status='PUBLISHED') OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM food_versions WHERE id=OLD.food_version_id AND status='PUBLISHED')) THEN RAISE EXCEPTION 'Published recipe is immutable'; END IF;
 RETURN COALESCE(NEW,OLD); END $$;
 CREATE TRIGGER immutable_recipe BEFORE INSERT OR UPDATE OR DELETE ON food_ingredients FOR EACH ROW EXECUTE FUNCTION protect_published_ingredients();
 `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP VIEW available_food_references; DROP TRIGGER immutable_recipe ON food_ingredients; DROP FUNCTION protect_published_ingredients();`,
    );
  }
}
