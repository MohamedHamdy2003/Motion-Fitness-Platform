import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnboardingWeekdays1793448007000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE genders(code text PRIMARY KEY);
      INSERT INTO genders(code) VALUES('MALE'),('FEMALE');
      UPDATE user_profiles SET gender=NULL WHERE gender NOT IN ('MALE','FEMALE');
      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_gender_check;
      ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_gender_lookup_fk
        FOREIGN KEY(gender) REFERENCES genders(code);

      ALTER TABLE user_profiles ADD COLUMN training_weekdays text[];
      CREATE FUNCTION valid_training_weekdays(days text[]) RETURNS boolean
        LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
          SELECT days IS NULL OR (
            cardinality(days) BETWEEN 2 AND 5
            AND days <@ ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']::text[]
            AND array_position(days,NULL) IS NULL
            AND cardinality(days) = (
              SELECT count(DISTINCT weekday)::integer FROM unnest(days) AS item(weekday)
            )
          )
        $$;
      ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_training_weekdays_valid_check
        CHECK(valid_training_weekdays(training_weekdays));

    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_training_weekdays_valid_check;
      ALTER TABLE user_profiles DROP COLUMN IF EXISTS training_weekdays;
      DROP FUNCTION IF EXISTS valid_training_weekdays(text[]);
      ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_gender_lookup_fk;
      DROP TABLE IF EXISTS genders;
      ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_gender_check
        CHECK(gender IS NULL OR gender IN ('FEMALE','MALE','NON_BINARY','PREFER_NOT_TO_SAY'));
    `);
  }
}
