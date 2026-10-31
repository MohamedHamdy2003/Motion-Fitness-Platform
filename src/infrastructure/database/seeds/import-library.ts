import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { parse, uuid } from '../../../common/http';
import * as dto from '../../../modules/content/content.dto';
import { ContentService } from '../../../modules/content/content.service';
import { query } from '../query';
const dataset = z
  .object({
    datasetId: dto.slug,
    version: z.number().int().positive(),
    ingredients: z.array(
      z.object({ id: uuid, slug: dto.slug, content: dto.ingredient }).strict(),
    ),
    exercises: z.array(
      z.object({ id: uuid, slug: dto.slug, content: dto.exercise }).strict(),
    ),
    foods: z.array(
      z.object({ id: uuid, slug: dto.slug, content: dto.food }).strict(),
    ),
  })
  .strict();
export async function importLibrary(db: DataSource, path: string) {
  const raw = readFileSync(path, 'utf8');
  const data = parse(dataset, JSON.parse(raw));
  const digest = createHash('sha256').update(raw).digest('hex');
  const service = new ContentService(db);
  return db.transaction(async (m) => {
    await query(m, `SELECT pg_advisory_xact_lock(1793448000)`);
    const [existing] = await query(
      m,
      `SELECT digest FROM content_seed_imports WHERE dataset_id=$1 AND version=$2`,
      [data.datasetId, data.version],
    );
    if (existing) {
      if (existing.digest !== digest)
        throw Error('Seed version already exists with different content');
      return;
    }
    for (const item of data.ingredients) {
      const c = item.content;
      const codes = [...new Set(c.allergenCodes)];
      if (
        (
          await query(
            m,
            `SELECT code FROM allergens WHERE code=ANY($1::text[])`,
            [codes],
          )
        ).length !== codes.length
      )
        throw Error('Unknown allergen');
      await query(
        m,
        `INSERT INTO food_reference_items VALUES($1,$2,'INGREDIENT')`,
        [item.id, c.title],
      );
      await query(
        m,
        `INSERT INTO ingredients(id,slug,title,dietary_tags,verification_status) VALUES($1,$2,$3,$4,$5)`,
        [item.id, item.slug, c.title, c.dietaryTags, c.verificationStatus],
      );
      for (const code of codes)
        await query(m, `INSERT INTO ingredient_allergens VALUES($1,$2)`, [
          item.id,
          code,
        ]);
    }
    for (const kind of ['exercises', 'foods'] as const)
      for (const item of data[kind]) {
        if (kind === 'foods')
          await query(
            m,
            `INSERT INTO food_reference_items VALUES($1,$2,'FOOD')`,
            [item.id, item.content.title],
          );
        await query(m, `INSERT INTO ${kind}(id,slug) VALUES($1,$2)`, [
          item.id,
          item.slug,
        ]);
        await service.insertVersion(m, kind, item.id, 1, item.content);
      }
    await query(m, `INSERT INTO content_seed_imports VALUES($1,$2,$3)`, [
      data.datasetId,
      data.version,
      digest,
    ]);
  });
}
