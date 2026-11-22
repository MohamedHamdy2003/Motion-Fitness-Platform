import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignTrainingAvailability1793448020000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await this.setMaximum(q, 6);
    await q.query(`
      UPDATE primary_goals SET label='Lose Weight' WHERE code='FAT_LOSS' AND label='Fat loss';
      UPDATE primary_goals SET label='Build Muscle' WHERE code='STRENGTH_HYPERTROPHY' AND label='Strength & hypertrophy';
      INSERT INTO primary_goals (code,label,display_order)
        SELECT entry.code,entry.label,ordering.last_position+entry.position
        FROM (VALUES ('GET_FIT_TONED','Get Fit & Toned',1),('IMPROVE_ENDURANCE','Improve Endurance',2)) AS entry(code,label,position)
        CROSS JOIN (SELECT coalesce(max(display_order),0) AS last_position FROM primary_goals) AS ordering
        ON CONFLICT(code) DO NOTHING;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    const [data] = await q.query(`
      SELECT EXISTS(SELECT 1 FROM user_profiles WHERE cardinality(training_weekdays)>5 OR training_days_per_week>5)
        OR EXISTS(SELECT 1 FROM program_versions WHERE training_days_per_week>5) AS has_six_day_data
    `);
    if (data.has_six_day_data)
      throw new Error(
        'Cannot roll back the training day limit while six-day profiles or programs exist',
      );
    await this.setMaximum(q, 5);
    // Lookup rows remain with their references so rollback never deletes goals used by profiles or programs.
  }

  private async setMaximum(q: QueryRunner, maximum: 5 | 6) {
    await q.query(`
      CREATE OR REPLACE FUNCTION valid_training_weekdays(days text[]) RETURNS boolean
      LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
        SELECT days IS NULL OR (
          cardinality(days) BETWEEN 2 AND ${maximum}
          AND days <@ ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']::text[]
          AND array_position(days,NULL) IS NULL
          AND cardinality(days) = (SELECT count(DISTINCT weekday) FROM unnest(days) AS item(weekday))
        )
      $$;
      ALTER TABLE user_profiles
        DROP CONSTRAINT user_profiles_training_days_per_week_check,
        ADD CONSTRAINT user_profiles_training_days_per_week_check CHECK(training_days_per_week BETWEEN 2 AND ${maximum});
      ALTER TABLE program_versions
        DROP CONSTRAINT program_versions_training_days_per_week_check,
        ADD CONSTRAINT program_versions_training_days_per_week_check CHECK(training_days_per_week BETWEEN 2 AND ${maximum});
    `);
  }
}
