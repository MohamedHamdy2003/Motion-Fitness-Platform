import { z } from 'zod';
import { uuid } from '../../common/http';
export enum TrainingWeekday {
  SUNDAY = 'SUNDAY',
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
}
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
const lookupCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{1,49}$/);
export const profileFields = {
  name: z.string().trim().min(1).max(120),
  gender: lookupCode,
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{6,30}$/)
    .nullable(),
  height_cm: z.number().positive().max(1000),
  weight_kg: z.number().positive().max(10000),
  target_weight_kg: z.number().positive().max(10000),
  primary_goal: lookupCode,
  fitness_level: lookupCode,
  training_days_per_week: z
    .array(z.enum(TrainingWeekday))
    .min(2)
    .max(5)
    .refine((days) => new Set(days).size === days.length, {
      message: 'Training weekdays must not contain duplicates',
    }),
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
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const onboarding = z
  .object({
    name: profileFields.name,
    gender: profileFields.gender,
    height_cm: profileFields.height_cm,
    weight_kg: profileFields.weight_kg,
    target_weight_kg: profileFields.target_weight_kg,
    primary_goal: profileFields.primary_goal,
    fitness_level: profileFields.fitness_level,
    training_days_per_week: profileFields.training_days_per_week,
    timezone,
    locale: profileFields.locale,
    date_of_birth: date,
    food_preferences: z
      .object({
        allergen_codes: z.array(lookupCode).max(100),
        disliked_food_ids: z.array(uuid).max(200),
      })
      .strict(),
  })
  .strict();
export const injuryFields = {
  body_area_code: lookupCode,
  side: z.enum(['LEFT', 'RIGHT', 'BOTH', 'UNSPECIFIED']).nullable().optional(),
  description: z.string().trim().min(1).max(2000),
};
export const injury = z
  .object({ ...injuryFields, confirmed: z.literal(true) })
  .strict();
export const injuryEdit = injury;
export const preferences = z
  .object({
    allergen_codes: z.array(lookupCode).max(100),
    disliked_food_ids: z.array(uuid).max(200),
  })
  .strict();
export const settings = z
  .object({
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
  .refine((v) => Object.keys(v).length > 0);
export const listQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
