import { z } from 'zod';
import { uuid } from '../../common/http';
export const timezone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA timezone');
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return (
      !Number.isNaN(d.valueOf()) &&
      d.toISOString().slice(0, 10) === v &&
      v < new Date().toISOString().slice(0, 10)
    );
  });
export const profileFields = {
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{6,30}$/)
    .nullable(),
  height_cm: z.number().positive().max(1000),
  primary_goal: z.enum(['FAT_LOSS', 'STRENGTH_HYPERTROPHY']),
  fitness_level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  training_days_per_week: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  timezone,
  locale: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
    .max(35),
  date_of_birth: date,
  avatar_media_id: uuid.nullable(),
};
export const profilePatch = z
  .object(profileFields)
  .partial()
  .extend({ expectedRevision: z.number().int().nonnegative() })
  .strict()
  .refine((v) => Object.keys(v).length > 1);
export const measurement = z
  .object({
    weight_kg: z.number().positive().max(10000).optional(),
    body_fat_percent: z.number().gt(0).lt(100).optional(),
    body_fat_method: z.string().min(1).max(80).optional(),
    measured_at: z.iso
      .datetime({ offset: true })
      .refine((v) => new Date(v) <= new Date()),
  })
  .strict()
  .refine((v) => v.weight_kg !== undefined || v.body_fat_percent !== undefined)
  .refine(
    (v) =>
      (v.body_fat_percent === undefined) === (v.body_fat_method === undefined),
  );
export const onboarding = z
  .object({
    name: profileFields.name,
    height_cm: profileFields.height_cm,
    primary_goal: profileFields.primary_goal,
    fitness_level: profileFields.fitness_level,
    training_days_per_week: profileFields.training_days_per_week,
    timezone,
    locale: profileFields.locale,
    date_of_birth: date,
    expectedRevision: z.number().int().nonnegative(),
    initialMeasurement: measurement.refine((v) => v.weight_kg !== undefined),
  })
  .strict();
export const injuryFields = {
  body_area_code: z
    .string()
    .regex(/^[A-Z_]+$/)
    .max(50),
  side: z.enum(['LEFT', 'RIGHT', 'BOTH', 'UNSPECIFIED']).nullable().optional(),
  description: z.string().trim().min(1).max(2000),
};
export const injury = z
  .object({ ...injuryFields, confirmed: z.literal(true) })
  .strict();
export const injuryEdit = injury.extend({
  expectedVersion: z.number().int().positive(),
});
export const preferences = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    allergen_codes: z.array(z.string().regex(/^[A-Z_]+$/)).max(100),
    disliked_food_ids: z.array(uuid).max(200),
    excluded_food_ids: z.array(uuid).max(200),
  })
  .strict();
export const settings = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reminders: z.boolean().optional(),
    theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
    quiet_hours: z
      .object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1);
export const listQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export const measurementQuery = listQuery
  .extend({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (v) =>
      !v.from ||
      !v.to ||
      (new Date(v.to).valueOf() >= new Date(v.from).valueOf() &&
        new Date(v.to).valueOf() - new Date(v.from).valueOf() <=
          366 * 86400000),
  );
