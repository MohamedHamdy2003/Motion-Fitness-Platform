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
    foodSections: z
      .array(
        z
          .object({
            id: uuid,
            slug: dto.slug,
            title: z.string().trim().min(1),
            members: z
              .array(
                z
                  .object({
                    foodId: uuid,
                    portionGPerUnit: z.number().positive(),
                    displayPortion: z.string().trim().min(1),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .default([]),
    mealSections: z
      .array(
        z
          .object({ id: uuid, slug: dto.slug, title: z.string().trim().min(1) })
          .strict(),
      )
      .default([]),
    meals: z
      .array(
        z
          .object({
            id: uuid,
            slug: dto.slug,
            sectionId: uuid,
            title: z.string().trim().min(1),
            items: z
              .array(
                z
                  .object({
                    foodSlug: dto.slug,
                    foodSectionSlug: dto.slug,
                    exchangeUnits: z.number().positive(),
                    position: z.number().int().nonnegative(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
function stableUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
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
            `SELECT code FROM allergens WHERE active AND code=ANY($1::text[])`,
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
    const memberIds = new Map<string, string>();
    for (const section of data.foodSections) {
      const groupVersionId = stableUuid(
        `${data.datasetId}:${data.version}:food-section:${section.slug}`,
      );
      await query(
        m,
        `INSERT INTO food_exchange_groups(id,slug) VALUES($1,$2)`,
        [section.id, section.slug],
      );
      await query(
        m,
        `INSERT INTO food_exchange_group_versions(id,group_id,version,title) VALUES($1,$2,1,$3)`,
        [groupVersionId, section.id, section.title],
      );
      for (const member of section.members) {
        const [foodVersion] = await query(
          m,
          `SELECT id FROM food_versions WHERE food_id=$1 AND version=1`,
          [member.foodId],
        );
        if (!foodVersion) throw Error(`Unknown seeded food ${member.foodId}`);
        const memberId = stableUuid(
          `${data.datasetId}:${data.version}:member:${section.slug}:${member.foodId}`,
        );
        await query(
          m,
          `INSERT INTO food_exchange_members(id,group_version_id,food_version_id,portion_g_per_unit,display_portion) VALUES($1,$2,$3,$4,$5)`,
          [
            memberId,
            groupVersionId,
            foodVersion.id,
            member.portionGPerUnit,
            member.displayPortion,
          ],
        );
        memberIds.set(`${member.foodId}:${section.slug}`, memberId);
      }
    }
    for (const section of data.mealSections)
      await query(
        m,
        `INSERT INTO meal_sections(id,slug,title) VALUES($1,$2,$3)`,
        [section.id, section.slug, section.title],
      );
    for (const meal of data.meals) {
      const [foodSection] = await query(
        m,
        `INSERT INTO meals(id,slug) VALUES($1,$2) RETURNING id`,
        [meal.id, meal.slug],
      );
      const versionId = stableUuid(
        `${data.datasetId}:${data.version}:meal:${meal.slug}`,
      );
      await query(
        m,
        `INSERT INTO meal_versions(id,meal_id,version,section_id,title) VALUES($1,$2,1,$3,$4)`,
        [versionId, foodSection.id, meal.sectionId, meal.title],
      );
      for (const item of meal.items) {
        const [food] = await query(m, `SELECT id FROM foods WHERE slug=$1`, [
          item.foodSlug,
        ]);
        const memberId = food
          ? memberIds.get(`${food.id}:${item.foodSectionSlug}`)
          : undefined;
        if (!memberId)
          throw Error(`No seeded section membership for food ${item.foodSlug}`);
        await query(
          m,
          `INSERT INTO meal_items(meal_version_id,default_exchange_member_id,exchange_units,position) VALUES($1,$2,$3,$4)`,
          [versionId, memberId, item.exchangeUnits, item.position],
        );
      }
    }
    await query(m, `INSERT INTO content_seed_imports VALUES($1,$2,$3)`, [
      data.datasetId,
      data.version,
      digest,
    ]);
  });
}
