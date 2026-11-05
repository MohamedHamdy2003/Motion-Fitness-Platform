import { z } from 'zod';
import { uuid } from '../../common/http';
const text = z.string().trim().min(1).max(4000);
const tags = z.array(z.string().trim().min(1).max(100)).max(100);
export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
export const expected = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
const source = z
  .object({ title: text, reference: text, licenseNotes: text })
  .strict();
export const exercise = z
  .object({
    title: text,
    description: text,
    instructions: z.array(text).min(1).max(50),
    muscleGroups: tags.min(1),
    equipment: tags,
    source,
    mediaId: uuid.nullable(),
  })
  .strict();
const nutrient = z.number().min(0).max(10000).nullable();
export const food = z
  .object({
    title: text,
    preparation: text,
    preparationState: z.enum(['RAW', 'COOKED', 'READY_TO_EAT']),
    prepMinutes: z.number().int().min(0).max(10080),
    energyKcal100g: nutrient,
    proteinG100g: nutrient,
    carbohydrateG100g: nutrient,
    fatG100g: nutrient,
    fiberG100g: nutrient,
    nutrientSource: source,
    mediaId: uuid.nullable(),
    ingredients: z
      .array(
        z
          .object({
            ingredientId: uuid,
            quantityG: z.number().positive().max(100000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.ingredients.map((i) => i.ingredientId)).size ===
      v.ingredients.length,
    'Duplicate ingredient',
  );
export const ingredient = z
  .object({
    title: text,
    dietaryTags: tags,
    allergenCodes: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z][A-Z0-9_]{1,49}$/),
      )
      .max(100),
    verificationStatus: z.enum(['UNKNOWN', 'VERIFIED']),
  })
  .strict();
const foodSectionFields = z
  .object({
    slug,
    title: text,
    members: z
      .array(
        z
          .object({
            foodVersionId: uuid,
            portionGPerUnit: z.number().positive().max(100000),
            displayPortion: text,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
const uniqueFoodVersions = <T extends { members: { foodVersionId: string }[] }>(
  v: T,
) => new Set(v.members.map((m) => m.foodVersionId)).size === v.members.length;
export const foodSection = foodSectionFields.refine(
  uniqueFoodVersions,
  'Duplicate food version',
);
export const mealSection = z.object({ slug, title: text }).strict();
const mealFields = z
  .object({
    slug,
    sectionId: uuid,
    title: text,
    items: z
      .array(
        z
          .object({
            memberId: uuid,
            exchangeUnits: z.number().positive().max(10000),
            position: z.number().int().min(0).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
const uniqueMealPositions = <T extends { items: { position: number }[] }>(
  v: T,
) => new Set(v.items.map((i) => i.position)).size === v.items.length;
export const meal = mealFields.refine(
  uniqueMealPositions,
  'Duplicate meal item position',
);
export const foodSectionUpdate = foodSectionFields
  .omit({ slug: true })
  .extend({ expectedRevision: z.number().int().positive() })
  .refine(uniqueFoodVersions, 'Duplicate food version');
export const mealUpdate = mealFields
  .omit({ slug: true })
  .extend({ expectedRevision: z.number().int().positive() })
  .refine(uniqueMealPositions, 'Duplicate meal item position');
export const mealItem = z
  .object({
    memberId: uuid,
    exchangeUnits: z.number().positive().max(10000),
    position: z.number().int().min(0).max(1000),
  })
  .strict();
export const mealItemUpdate = z
  .object({
    expectedRevision: z.number().int().positive(),
    memberId: uuid.optional(),
    exchangeUnits: z.number().positive().max(10000).optional(),
    position: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.memberId !== undefined ||
      value.exchangeUnits !== undefined ||
      value.position !== undefined,
    'At least one meal item field must be supplied',
  );
export const mealItemPosition = z.coerce.number().int().min(0).max(1000);
export const page = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
