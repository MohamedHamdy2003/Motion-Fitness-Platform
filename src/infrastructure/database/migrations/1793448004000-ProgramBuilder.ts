import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProgramBuilder1793448004000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE programs(
        id uuid PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE nutrition_plans(
        id uuid PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE nutrition_plan_versions(
        id uuid PRIMARY KEY,
        nutrition_plan_id uuid NOT NULL REFERENCES nutrition_plans,
        version integer NOT NULL CHECK(version>0),
        revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
        duration_days integer NOT NULL CHECK(duration_days>0),
        status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
        UNIQUE(nutrition_plan_id,version),
        UNIQUE(id,nutrition_plan_id)
      );
      CREATE TABLE nutrition_template_days(
        id uuid PRIMARY KEY,
        nutrition_plan_version_id uuid NOT NULL REFERENCES nutrition_plan_versions,
        day_position integer NOT NULL CHECK(day_position>0),
        UNIQUE(nutrition_plan_version_id,day_position),
        UNIQUE(id,nutrition_plan_version_id)
      );
      CREATE TABLE meal_slots(
        id uuid PRIMARY KEY,
        template_day_id uuid NOT NULL REFERENCES nutrition_template_days,
        position integer NOT NULL CHECK(position>=0),
        meal_type text NOT NULL CHECK(length(trim(meal_type)) BETWEEN 1 AND 40),
        local_time time NOT NULL,
        default_meal_version_id uuid NOT NULL REFERENCES meal_versions,
        UNIQUE(template_day_id,position)
      );
      CREATE TABLE program_versions(
        id uuid PRIMARY KEY,
        program_id uuid NOT NULL REFERENCES programs,
        version integer NOT NULL CHECK(version>0),
        revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
        status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
        title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
        primary_goal text NOT NULL CHECK(primary_goal IN ('FAT_LOSS','STRENGTH_HYPERTROPHY')),
        supported_goals text[] NOT NULL DEFAULT '{}',
        ideal_level text NOT NULL CHECK(ideal_level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
        supported_levels text[] NOT NULL,
        training_days_per_week integer NOT NULL CHECK(training_days_per_week IN (2,3,4,5)),
        editorial_priority integer NOT NULL DEFAULT 0,
        description text NOT NULL,
        required_equipment text[] NOT NULL DEFAULT '{}',
        intended_audience text,
        nutrition_plan_version_id uuid NOT NULL UNIQUE REFERENCES nutrition_plan_versions,
        approved_hint_version_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK(cardinality(supported_goals)>0 AND supported_goals <@ ARRAY['FAT_LOSS','STRENGTH_HYPERTROPHY']::text[] AND primary_goal=ANY(supported_goals)),
        CHECK(cardinality(supported_levels)>0 AND supported_levels <@ ARRAY['BEGINNER','INTERMEDIATE','ADVANCED']::text[] AND ideal_level=ANY(supported_levels)),
        UNIQUE(program_id,version),
        UNIQUE(id,program_id)
      );
      CREATE TABLE workouts(
        id uuid PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE workout_revisions(
        id uuid PRIMARY KEY,
        workout_id uuid NOT NULL REFERENCES workouts,
        version integer NOT NULL CHECK(version>0),
        revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
        status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
        title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
        description text NOT NULL,
        UNIQUE(workout_id,version)
      );
      CREATE TABLE workout_exercises(
        id uuid PRIMARY KEY,
        workout_revision_id uuid NOT NULL REFERENCES workout_revisions,
        exercise_revision_id uuid NOT NULL REFERENCES exercise_revisions,
        position integer NOT NULL CHECK(position>=0),
        set_count integer NOT NULL CHECK(set_count BETWEEN 1 AND 100),
        reps_min integer,
        reps_max integer,
        duration_seconds integer,
        rest_seconds integer NOT NULL CHECK(rest_seconds BETWEEN 0 AND 3600),
        CHECK((reps_min IS NOT NULL AND reps_max IS NOT NULL AND reps_min>0 AND reps_max>=reps_min AND duration_seconds IS NULL) OR (reps_min IS NULL AND reps_max IS NULL AND duration_seconds BETWEEN 1 AND 86400)),
        UNIQUE(workout_revision_id,position)
      );
      CREATE TABLE monthly_plans(
        id uuid PRIMARY KEY,
        program_version_id uuid NOT NULL REFERENCES program_versions,
        position integer NOT NULL CHECK(position>0),
        title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
        UNIQUE(program_version_id,position)
      );
      CREATE TABLE plan_weeks(
        id uuid PRIMARY KEY,
        monthly_plan_id uuid NOT NULL REFERENCES monthly_plans,
        position integer NOT NULL CHECK(position BETWEEN 1 AND 4),
        UNIQUE(monthly_plan_id,position)
      );
      CREATE TABLE plan_days(
        id uuid PRIMARY KEY,
        week_id uuid NOT NULL REFERENCES plan_weeks,
        position integer NOT NULL CHECK(position BETWEEN 1 AND 7),
        kind text NOT NULL CHECK(kind IN ('TRAINING','REST')),
        workout_revision_id uuid REFERENCES workout_revisions,
        nutrition_template_day_id uuid NOT NULL UNIQUE REFERENCES nutrition_template_days,
        CHECK((kind='TRAINING' AND workout_revision_id IS NOT NULL) OR (kind='REST' AND workout_revision_id IS NULL)),
        UNIQUE(week_id,position)
      );
      CREATE TABLE program_hint_versions(
        id uuid PRIMARY KEY,
        program_version_id uuid NOT NULL REFERENCES program_versions,
        version integer NOT NULL CHECK(version>0),
        original_text text NOT NULL,
        structured_hints jsonb NOT NULL,
        status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED')),
        approved_by uuid REFERENCES users,
        approved_at timestamptz,
        UNIQUE(program_version_id,version),
        CHECK((status='DRAFT' AND approved_by IS NULL AND approved_at IS NULL) OR (status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
      );
      ALTER TABLE program_versions ADD CONSTRAINT program_approved_hint_fk FOREIGN KEY(approved_hint_version_id) REFERENCES program_hint_versions;
      CREATE FUNCTION protect_published_program_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published program version is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_program_version BEFORE UPDATE OR DELETE ON program_versions FOR EACH ROW EXECUTE FUNCTION protect_published_program_version();
      CREATE FUNCTION protect_published_nutrition_plan_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published nutrition plan version is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_nutrition_plan_version BEFORE UPDATE OR DELETE ON nutrition_plan_versions FOR EACH ROW EXECUTE FUNCTION protect_published_nutrition_plan_version();
      CREATE FUNCTION protect_published_workout_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published workout revision is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_workout_revision BEFORE UPDATE OR DELETE ON workout_revisions FOR EACH ROW EXECUTE FUNCTION protect_published_workout_revision();
      CREATE FUNCTION protect_published_program_children() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE target_id uuid; kind_id uuid;
      BEGIN
        IF TG_TABLE_NAME='nutrition_template_days' THEN
          kind_id := CASE WHEN TG_OP='DELETE' THEN OLD.nutrition_plan_version_id ELSE NEW.nutrition_plan_version_id END;
          IF EXISTS(SELECT 1 FROM nutrition_plan_versions WHERE id=kind_id AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published nutrition plan structure is immutable'; END IF;
        ELSIF TG_TABLE_NAME='meal_slots' THEN
          target_id := CASE WHEN TG_OP='DELETE' THEN OLD.template_day_id ELSE NEW.template_day_id END;
          SELECT nutrition_plan_version_id INTO kind_id FROM nutrition_template_days WHERE id=target_id;
          IF EXISTS(SELECT 1 FROM nutrition_plan_versions WHERE id=kind_id AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published nutrition plan structure is immutable'; END IF;
        ELSIF TG_TABLE_NAME='workout_exercises' THEN
          target_id := CASE WHEN TG_OP='DELETE' THEN OLD.workout_revision_id ELSE NEW.workout_revision_id END;
          IF EXISTS(SELECT 1 FROM workout_revisions WHERE id=target_id AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published workout structure is immutable'; END IF;
        ELSIF TG_TABLE_NAME='monthly_plans' THEN
          target_id := CASE WHEN TG_OP='DELETE' THEN OLD.program_version_id ELSE NEW.program_version_id END;
          IF EXISTS(SELECT 1 FROM program_versions WHERE id=target_id AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published program structure is immutable'; END IF;
        ELSIF TG_TABLE_NAME='plan_weeks' THEN
          target_id := CASE WHEN TG_OP='DELETE' THEN OLD.monthly_plan_id ELSE NEW.monthly_plan_id END;
          IF EXISTS(SELECT 1 FROM monthly_plans mp JOIN program_versions pv ON pv.id=mp.program_version_id WHERE mp.id=target_id AND pv.status='PUBLISHED') THEN RAISE EXCEPTION 'Published program structure is immutable'; END IF;
        ELSIF TG_TABLE_NAME='plan_days' THEN
          target_id := CASE WHEN TG_OP='DELETE' THEN OLD.week_id ELSE NEW.week_id END;
          IF EXISTS(SELECT 1 FROM plan_weeks w JOIN monthly_plans mp ON mp.id=w.monthly_plan_id JOIN program_versions pv ON pv.id=mp.program_version_id WHERE w.id=target_id AND pv.status='PUBLISHED') THEN RAISE EXCEPTION 'Published program structure is immutable'; END IF;
        END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_nutrition_day BEFORE INSERT OR UPDATE OR DELETE ON nutrition_template_days FOR EACH ROW EXECUTE FUNCTION protect_published_program_children();
      CREATE TRIGGER immutable_meal_slot BEFORE INSERT OR UPDATE OR DELETE ON meal_slots FOR EACH ROW EXECUTE FUNCTION protect_published_program_children();
      CREATE TRIGGER immutable_workout_exercise BEFORE INSERT OR UPDATE OR DELETE ON workout_exercises FOR EACH ROW EXECUTE FUNCTION protect_published_program_children();
      CREATE TRIGGER immutable_monthly_plan BEFORE INSERT OR UPDATE OR DELETE ON monthly_plans FOR EACH ROW EXECUTE FUNCTION protect_published_program_children();
      CREATE TRIGGER immutable_plan_week BEFORE INSERT OR UPDATE OR DELETE ON plan_weeks FOR EACH ROW EXECUTE FUNCTION protect_published_program_children();
      CREATE TRIGGER immutable_plan_day BEFORE INSERT OR UPDATE OR DELETE ON plan_days FOR EACH ROW EXECUTE FUNCTION protect_published_program_children();
      CREATE FUNCTION protect_approved_program_hint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.status='APPROVED' THEN RAISE EXCEPTION 'Approved program hint is immutable'; END IF;
        RETURN COALESCE(NEW,OLD);
      END $$;
      CREATE TRIGGER immutable_program_hint BEFORE UPDATE OR DELETE ON program_hint_versions FOR EACH ROW EXECUTE FUNCTION protect_approved_program_hint();
      CREATE INDEX program_versions_status_idx ON program_versions(status,primary_goal,training_days_per_week);
      CREATE INDEX program_version_months_idx ON monthly_plans(program_version_id,position);
      CREATE INDEX nutrition_day_version_idx ON nutrition_template_days(nutrition_plan_version_id,day_position);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE plan_days,plan_weeks,monthly_plans,program_hint_versions,workout_exercises,workout_revisions,workouts,program_versions,meal_slots,nutrition_template_days,nutrition_plan_versions,nutrition_plans,programs CASCADE;
      DROP FUNCTION protect_approved_program_hint();
      DROP FUNCTION protect_published_program_children();
      DROP FUNCTION protect_published_workout_revision();
      DROP FUNCTION protect_published_nutrition_plan_version();
      DROP FUNCTION protect_published_program_version();
    `);
  }
}
