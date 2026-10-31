import { MigrationInterface, QueryRunner } from 'typeorm';
export class ContentLibrary1793448000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE media_assets DROP CONSTRAINT media_assets_size_check; ALTER TABLE media_assets ADD CONSTRAINT media_assets_size_check CHECK(size>0 AND size<=104857600); ALTER TABLE media_assets ADD COLUMN library_asset boolean NOT NULL DEFAULT false; ALTER TABLE media_assets ADD COLUMN library_archived boolean NOT NULL DEFAULT false; CREATE TABLE content_seed_imports(dataset_id text,version integer,digest text NOT NULL,PRIMARY KEY(dataset_id,version)); CREATE TABLE exercises(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL,archived boolean NOT NULL DEFAULT false);
      CREATE TABLE exercise_revisions(id uuid PRIMARY KEY,exercise_id uuid NOT NULL REFERENCES exercises,version integer NOT NULL CHECK(version>0),revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),content jsonb NOT NULL,media_id uuid REFERENCES media_assets,UNIQUE(exercise_id,version));
      CREATE TABLE ingredients(id uuid PRIMARY KEY REFERENCES food_reference_items,slug text UNIQUE NOT NULL,title text NOT NULL,dietary_tags text[] NOT NULL DEFAULT '{}',verification_status text NOT NULL DEFAULT 'UNKNOWN' CHECK(verification_status IN ('UNKNOWN','VERIFIED')),metadata_version integer NOT NULL DEFAULT 1,archived boolean NOT NULL DEFAULT false);
      CREATE TABLE ingredient_allergens(ingredient_id uuid REFERENCES ingredients,allergen_code text REFERENCES allergens,PRIMARY KEY(ingredient_id,allergen_code));
      CREATE TABLE foods(id uuid PRIMARY KEY REFERENCES food_reference_items,slug text UNIQUE NOT NULL,archived boolean NOT NULL DEFAULT false);
      CREATE TABLE food_versions(id uuid PRIMARY KEY,food_id uuid NOT NULL REFERENCES foods,version integer NOT NULL CHECK(version>0),revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),content jsonb NOT NULL,media_id uuid REFERENCES media_assets,UNIQUE(food_id,version));
      CREATE TABLE food_ingredients(food_version_id uuid REFERENCES food_versions ON DELETE CASCADE,ingredient_id uuid REFERENCES ingredients,quantity_g numeric NOT NULL CHECK(quantity_g>0),PRIMARY KEY(food_version_id,ingredient_id));
      CREATE FUNCTION protect_published_content() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published content is immutable'; END IF; RETURN COALESCE(NEW,OLD); END $$;
      CREATE TRIGGER immutable_exercise BEFORE UPDATE OR DELETE ON exercise_revisions FOR EACH ROW EXECUTE FUNCTION protect_published_content();
      CREATE TRIGGER immutable_food BEFORE UPDATE OR DELETE ON food_versions FOR EACH ROW EXECUTE FUNCTION protect_published_content();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE IF EXISTS content_seed_imports,food_ingredients,food_versions,foods,ingredient_allergens,ingredients,exercise_revisions,exercises; DROP FUNCTION protect_published_content(); ALTER TABLE media_assets DROP COLUMN library_asset; ALTER TABLE media_assets DROP COLUMN IF EXISTS library_archived;`,
    );
  }
}
