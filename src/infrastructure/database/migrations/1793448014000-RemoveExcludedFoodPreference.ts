import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExcludedFoodPreference1793448014000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM user_food_exclusions legacy
      USING user_food_exclusions disliked
      WHERE legacy.user_id=disliked.user_id
        AND legacy.food_id=disliked.food_id
        AND legacy.kind='EXCLUSION'
        AND disliked.kind='DISLIKE';

      UPDATE user_food_exclusions SET kind='DISLIKE' WHERE kind='EXCLUSION';
      ALTER TABLE user_food_exclusions
        DROP CONSTRAINT user_food_exclusions_kind_check,
        DROP CONSTRAINT user_food_exclusions_pkey,
        DROP COLUMN kind,
        ADD PRIMARY KEY(user_id,food_id);
      ALTER TABLE user_food_exclusions RENAME TO user_disliked_foods;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_disliked_foods RENAME TO user_food_exclusions;
      ALTER TABLE user_food_exclusions
        DROP CONSTRAINT user_food_exclusions_pkey,
        ADD COLUMN kind text NOT NULL DEFAULT 'DISLIKE',
        ADD CONSTRAINT user_food_exclusions_kind_check CHECK(kind IN ('DISLIKE','EXCLUSION')),
        ADD PRIMARY KEY(user_id,food_id,kind);
      ALTER TABLE user_food_exclusions ALTER COLUMN kind DROP DEFAULT;
    `);
  }
}
