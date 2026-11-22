import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectPublishedProgramStructure1793448018000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION prevent_program_child_reparenting() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF (to_jsonb(OLD) -> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(NEW) -> TG_ARGV[0]) THEN
          RAISE EXCEPTION 'Program structure cannot be moved between parents' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER fixed_program_month_parent BEFORE UPDATE OF program_version_id ON monthly_plans
        FOR EACH ROW EXECUTE FUNCTION prevent_program_child_reparenting('program_version_id');
      CREATE TRIGGER fixed_program_week_parent BEFORE UPDATE OF monthly_plan_id ON plan_weeks
        FOR EACH ROW EXECUTE FUNCTION prevent_program_child_reparenting('monthly_plan_id');
      CREATE TRIGGER fixed_program_day_parent BEFORE UPDATE OF week_id ON plan_days
        FOR EACH ROW EXECUTE FUNCTION prevent_program_child_reparenting('week_id');
      CREATE TRIGGER fixed_workout_exercise_parent BEFORE UPDATE OF workout_revision_id ON workout_exercises
        FOR EACH ROW EXECUTE FUNCTION prevent_program_child_reparenting('workout_revision_id');
      CREATE TRIGGER fixed_nutrition_day_parent BEFORE UPDATE OF nutrition_plan_version_id ON nutrition_template_days
        FOR EACH ROW EXECUTE FUNCTION prevent_program_child_reparenting('nutrition_plan_version_id');
      CREATE TRIGGER fixed_meal_slot_parent BEFORE UPDATE OF template_day_id ON meal_slots
        FOR EACH ROW EXECUTE FUNCTION prevent_program_child_reparenting('template_day_id');

      CREATE FUNCTION protect_published_program_eligibility() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        old_version uuid;
        new_version uuid;
        version_status text;
      BEGIN
        IF TG_OP <> 'INSERT' THEN old_version := OLD.program_version_id; END IF;
        IF TG_OP <> 'DELETE' THEN new_version := NEW.program_version_id; END IF;
        FOR version_status IN
          SELECT status FROM program_versions
          WHERE id IN (old_version, new_version)
          ORDER BY id FOR SHARE
        LOOP
          IF version_status = 'PUBLISHED' THEN
            RAISE EXCEPTION 'Published program eligibility is immutable' USING ERRCODE = '23514';
          END IF;
        END LOOP;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER immutable_program_supported_goals BEFORE INSERT OR UPDATE OR DELETE ON program_version_supported_goals
        FOR EACH ROW EXECUTE FUNCTION protect_published_program_eligibility();
      CREATE TRIGGER immutable_program_supported_levels BEFORE INSERT OR UPDATE OR DELETE ON program_version_supported_levels
        FOR EACH ROW EXECUTE FUNCTION protect_published_program_eligibility();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TRIGGER immutable_program_supported_levels ON program_version_supported_levels;
      DROP TRIGGER immutable_program_supported_goals ON program_version_supported_goals;
      DROP FUNCTION protect_published_program_eligibility();
      DROP TRIGGER fixed_meal_slot_parent ON meal_slots;
      DROP TRIGGER fixed_nutrition_day_parent ON nutrition_template_days;
      DROP TRIGGER fixed_workout_exercise_parent ON workout_exercises;
      DROP TRIGGER fixed_program_day_parent ON plan_days;
      DROP TRIGGER fixed_program_week_parent ON plan_weeks;
      DROP TRIGGER fixed_program_month_parent ON monthly_plans;
      DROP FUNCTION prevent_program_child_reparenting();
    `);
  }
}
