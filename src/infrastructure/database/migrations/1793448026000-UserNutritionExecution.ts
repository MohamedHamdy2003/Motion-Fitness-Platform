import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserNutritionExecution1793448026000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE nutrition_days (
        id uuid PRIMARY KEY,
        enrollment_id uuid NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
        template_day_id uuid NOT NULL REFERENCES nutrition_template_days(id),
        day_number integer NOT NULL CHECK (day_number > 0),
        local_date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (enrollment_id, local_date),
        UNIQUE (enrollment_id, day_number),
        UNIQUE (enrollment_id, template_day_id)
      );

      CREATE TABLE scheduled_meals (
        id uuid PRIMARY KEY,
        nutrition_day_id uuid NOT NULL REFERENCES nutrition_days(id) ON DELETE CASCADE,
        meal_slot_id uuid NOT NULL REFERENCES meal_slots(id),
        position integer NOT NULL CHECK (position >= 0),
        meal_type text NOT NULL,
        local_time time NOT NULL,
        original_meal_version_id uuid NOT NULL REFERENCES meal_versions(id),
        selected_meal_version_id uuid NOT NULL REFERENCES meal_versions(id),
        selection_version integer NOT NULL DEFAULT 1 CHECK (selection_version > 0),
        version integer NOT NULL DEFAULT 1 CHECK (version > 0),
        status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'COMPLETED')),
        completed_at timestamptz,
        CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
        UNIQUE (nutrition_day_id, meal_slot_id),
        UNIQUE (nutrition_day_id, position)
      );

      CREATE TABLE scheduled_meal_items (
        id uuid PRIMARY KEY,
        scheduled_meal_id uuid NOT NULL REFERENCES scheduled_meals(id) ON DELETE CASCADE,
        selection_version integer NOT NULL CHECK (selection_version > 0),
        position integer NOT NULL CHECK (position >= 0),
        original_exchange_member_id uuid NOT NULL REFERENCES food_exchange_members(id),
        selected_exchange_member_id uuid NOT NULL REFERENCES food_exchange_members(id),
        exchange_units numeric NOT NULL CHECK (exchange_units > 0),
        portion_g numeric NOT NULL CHECK (portion_g > 0),
        version integer NOT NULL DEFAULT 1 CHECK (version > 0),
        status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
        completed_at timestamptz,
        CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
        UNIQUE (scheduled_meal_id, selection_version, position)
      );

      CREATE TABLE meal_item_substitutions (
        id uuid PRIMARY KEY,
        scheduled_meal_item_id uuid NOT NULL REFERENCES scheduled_meal_items(id) ON DELETE CASCADE,
        from_member_id uuid NOT NULL REFERENCES food_exchange_members(id),
        to_member_id uuid NOT NULL REFERENCES food_exchange_members(id),
        resulting_item_version integer NOT NULL CHECK (resulting_item_version > 1),
        portion_g numeric NOT NULL CHECK (portion_g > 0),
        preference_revision integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (scheduled_meal_item_id, resulting_item_version)
      );

      CREATE TABLE meal_substitutions (
        id uuid PRIMARY KEY,
        scheduled_meal_id uuid NOT NULL REFERENCES scheduled_meals(id) ON DELETE CASCADE,
        from_meal_version_id uuid NOT NULL REFERENCES meal_versions(id),
        to_meal_version_id uuid NOT NULL REFERENCES meal_versions(id),
        previous_selection_version integer NOT NULL CHECK (previous_selection_version > 0),
        resulting_selection_version integer NOT NULL CHECK (resulting_selection_version > previous_selection_version),
        preference_revision integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (scheduled_meal_id, resulting_selection_version)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE meal_substitutions, meal_item_substitutions, scheduled_meal_items, scheduled_meals, nutrition_days;',
    );
  }
}
