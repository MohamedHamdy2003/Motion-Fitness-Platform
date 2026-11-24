import { MigrationInterface, QueryRunner } from 'typeorm';

export class BilingualFaqWithoutSlug1793448029000 implements MigrationInterface {
  name = 'BilingualFaqWithoutSlug1793448029000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE faq_entries
        ADD COLUMN question_ar text,
        ADD COLUMN answer_ar text,
        ADD COLUMN question_en text,
        ADD COLUMN answer_en text;

      -- Pair existing EN rows that share a base slug with an AR row before dropping slug/locale.
      UPDATE faq_entries en
      SET question_ar = ar.question,
          answer_ar = ar.answer,
          question_en = en.question,
          answer_en = en.answer
      FROM faq_entries ar
      WHERE en.locale = 'en'
        AND ar.locale = 'ar'
        AND en.slug LIKE '%-en'
        AND ar.slug = left(en.slug, length(en.slug) - 3) || '-ar';

      DELETE FROM faq_entries ar
      USING faq_entries en
      WHERE en.locale = 'en'
        AND ar.locale = 'ar'
        AND en.slug LIKE '%-en'
        AND ar.slug = left(en.slug, length(en.slug) - 3) || '-ar';

      -- Populate remaining single-locale rows so no existing data is lost.
      UPDATE faq_entries
      SET question_ar = coalesce(question_ar, question),
          answer_ar = coalesce(answer_ar, answer),
          question_en = coalesce(question_en, question),
          answer_en = coalesce(answer_en, answer)
      WHERE question_ar IS NULL
         OR answer_ar IS NULL
         OR question_en IS NULL
         OR answer_en IS NULL;

      DROP INDEX IF EXISTS faq_entries_active_locale_idx;

      ALTER TABLE faq_entries
        ALTER COLUMN question_ar SET NOT NULL,
        ALTER COLUMN answer_ar SET NOT NULL,
        ALTER COLUMN question_en SET NOT NULL,
        ALTER COLUMN answer_en SET NOT NULL,
        ADD CONSTRAINT faq_question_ar_len CHECK (length(btrim(question_ar)) BETWEEN 1 AND 500),
        ADD CONSTRAINT faq_answer_ar_len CHECK (length(btrim(answer_ar)) BETWEEN 1 AND 5000),
        ADD CONSTRAINT faq_question_en_len CHECK (length(btrim(question_en)) BETWEEN 1 AND 500),
        ADD CONSTRAINT faq_answer_en_len CHECK (length(btrim(answer_en)) BETWEEN 1 AND 5000),
        DROP COLUMN slug,
        DROP COLUMN locale,
        DROP COLUMN question,
        DROP COLUMN answer;

      CREATE INDEX faq_entries_active_category_idx
        ON faq_entries(active, category, display_order, created_at);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS faq_entries_active_category_idx;

      ALTER TABLE faq_entries
        ADD COLUMN slug text,
        ADD COLUMN locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar')),
        ADD COLUMN question text,
        ADD COLUMN answer text;

      UPDATE faq_entries
      SET slug = 'faq-' || replace(id::text, '-', ''),
          question = question_en,
          answer = answer_en;

      ALTER TABLE faq_entries
        ALTER COLUMN slug SET NOT NULL,
        ALTER COLUMN question SET NOT NULL,
        ALTER COLUMN answer SET NOT NULL,
        ADD CONSTRAINT faq_entries_slug_unique UNIQUE (slug),
        DROP CONSTRAINT IF EXISTS faq_question_ar_len,
        DROP CONSTRAINT IF EXISTS faq_answer_ar_len,
        DROP CONSTRAINT IF EXISTS faq_question_en_len,
        DROP CONSTRAINT IF EXISTS faq_answer_en_len,
        DROP COLUMN question_ar,
        DROP COLUMN answer_ar,
        DROP COLUMN question_en,
        DROP COLUMN answer_en;

      CREATE INDEX faq_entries_active_locale_idx
        ON faq_entries(active, locale, category, display_order);
    `);
  }
}
