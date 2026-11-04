import { MigrationInterface, QueryRunner } from 'typeorm';

export class NutritionLibrary1793448003000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE food_exchange_groups(id uuid PRIMARY KEY,slug text NOT NULL UNIQUE,archived boolean NOT NULL DEFAULT false);
      CREATE TABLE food_exchange_group_versions(id uuid PRIMARY KEY,group_id uuid NOT NULL REFERENCES food_exchange_groups,version integer NOT NULL CHECK(version>0),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),title text NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),UNIQUE(group_id,version));
      CREATE TABLE food_exchange_members(id uuid PRIMARY KEY,group_version_id uuid NOT NULL REFERENCES food_exchange_group_versions,food_version_id uuid NOT NULL REFERENCES food_versions,portion_g_per_unit numeric NOT NULL CHECK(portion_g_per_unit>0),display_portion text NOT NULL CHECK(length(trim(display_portion))>0),UNIQUE(group_version_id,food_version_id));
      CREATE TABLE meal_sections(id uuid PRIMARY KEY,slug text NOT NULL UNIQUE,title text NOT NULL,archived boolean NOT NULL DEFAULT false);
      CREATE TABLE meals(id uuid PRIMARY KEY,slug text NOT NULL UNIQUE,archived boolean NOT NULL DEFAULT false);
      CREATE TABLE meal_versions(id uuid PRIMARY KEY,meal_id uuid NOT NULL REFERENCES meals,version integer NOT NULL CHECK(version>0),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),section_id uuid NOT NULL REFERENCES meal_sections,title text NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),availability_status text NOT NULL DEFAULT 'AVAILABLE' CHECK(availability_status IN ('AVAILABLE','UNAVAILABLE')),UNIQUE(meal_id,version));
      CREATE TABLE meal_items(meal_version_id uuid NOT NULL REFERENCES meal_versions ON DELETE CASCADE,default_exchange_member_id uuid NOT NULL REFERENCES food_exchange_members,exchange_units numeric NOT NULL CHECK(exchange_units>0),position integer NOT NULL CHECK(position>=0),PRIMARY KEY(meal_version_id,position));
      CREATE FUNCTION protect_published_nutrition_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published nutrition version is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_food_exchange_group BEFORE UPDATE OR DELETE ON food_exchange_group_versions FOR EACH ROW EXECUTE FUNCTION protect_published_nutrition_version();
      CREATE FUNCTION protect_published_food_exchange_members() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target_id uuid; BEGIN
        target_id := CASE WHEN TG_OP='DELETE' THEN OLD.group_version_id ELSE NEW.group_version_id END;
        IF EXISTS(SELECT 1 FROM food_exchange_group_versions WHERE id=target_id AND status='PUBLISHED') OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM food_exchange_group_versions WHERE id=OLD.group_version_id AND status='PUBLISHED')) THEN RAISE EXCEPTION 'Published food section is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_food_exchange_member BEFORE INSERT OR UPDATE OR DELETE ON food_exchange_members FOR EACH ROW EXECUTE FUNCTION protect_published_food_exchange_members();
      CREATE TRIGGER immutable_meal_version BEFORE UPDATE OR DELETE ON meal_versions FOR EACH ROW EXECUTE FUNCTION protect_published_nutrition_version();
      CREATE FUNCTION protect_published_meal_items() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target_id uuid; BEGIN
        target_id := CASE WHEN TG_OP='DELETE' THEN OLD.meal_version_id ELSE NEW.meal_version_id END;
        IF EXISTS(SELECT 1 FROM meal_versions WHERE id=target_id AND status='PUBLISHED') OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM meal_versions WHERE id=OLD.meal_version_id AND status='PUBLISHED')) THEN RAISE EXCEPTION 'Published meal is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_meal_item BEFORE INSERT OR UPDATE OR DELETE ON meal_items FOR EACH ROW EXECUTE FUNCTION protect_published_meal_items();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE meal_items,meal_versions,meals,meal_sections,food_exchange_members,food_exchange_group_versions,food_exchange_groups; DROP FUNCTION protect_published_meal_items(); DROP FUNCTION protect_published_food_exchange_members(); DROP FUNCTION protect_published_nutrition_version();`,
    );
  }
}
