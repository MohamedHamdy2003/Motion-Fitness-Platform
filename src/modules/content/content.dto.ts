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
    allergenCodes: tags,
    verificationStatus: z.enum(['UNKNOWN', 'VERIFIED']),
  })
  .strict();
export const page = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
