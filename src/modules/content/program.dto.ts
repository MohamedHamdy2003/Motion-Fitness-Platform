import { z } from 'zod';
import { uuid } from '../../common/http';
import { slug } from './content.dto';

const text = z.string().trim().min(1).max(4000);
const level = z
  .string()
  .regex(/^[A-Z_]+$/)
  .max(40);
const goal = z
  .string()
  .regex(/^[A-Z_]+$/)
  .max(40);
const tags = z.array(z.string().trim().min(1).max(100)).max(50);

const prescription = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('REPS'),
      setCount: z.number().int().min(1).max(100),
      repsMin: z.number().int().min(1).max(1000),
      repsMax: z.number().int().min(1).max(1000),
      restSeconds: z.number().int().min(0).max(3600),
    })
    .strict()
    .refine((v) => v.repsMax >= v.repsMin, 'repsMax must be at least repsMin'),
  z
    .object({
      mode: z.literal('DURATION'),
      setCount: z.number().int().min(1).max(100),
      durationSeconds: z.number().int().min(1).max(86400),
      restSeconds: z.number().int().min(0).max(3600),
    })
    .strict(),
]);

const workout = z
  .object({
    title: text.max(160),
    description: text,
    exercises: z
      .array(z.object({ exerciseRevisionId: uuid, prescription }).strict())
      .min(1)
      .max(50),
  })
  .strict();

const mealSlot = z
  .object({
    mealType: z.string().trim().min(1).max(40),
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    mealVersionId: uuid,
  })
  .strict();

const day = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('TRAINING'),
      workout,
      meals: z.array(mealSlot).max(10),
    })
    .strict(),
  z
    .object({ kind: z.literal('REST'), meals: z.array(mealSlot).max(10) })
    .strict(),
]);

const week = z.object({ days: z.array(day).length(7) }).strict();
const month = z
  .object({ title: text.max(160), weeks: z.array(week).length(4) })
  .strict();

const programFields = z
  .object({
    slug,
    title: text.max(160),
    primaryGoal: goal,
    supportedGoals: z.array(goal).max(2),
    idealLevel: level,
    supportedLevels: z.array(level).min(1).max(3),
    trainingDaysPerWeek: z.union([
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    editorialPriority: z.number().int().min(-1000).max(1000),
    description: text,
    requiredEquipment: tags,
    intendedAudience: z.string().trim().max(500).nullable(),
    months: z.array(month).min(1).max(12),
  })
  .strict();

function programChecks<T extends z.ZodObject>(schema: T) {
  return schema
    .refine((raw) => {
      const v = raw as unknown as {
        supportedLevels: z.infer<typeof level>[];
        idealLevel: z.infer<typeof level>;
        supportedGoals: z.infer<typeof goal>[];
        primaryGoal: z.infer<typeof goal>;
      };
      return v.supportedLevels.includes(v.idealLevel);
    }, 'supportedLevels must include idealLevel')
    .refine((raw) => {
      const v = raw as unknown as {
        supportedLevels: z.infer<typeof level>[];
        idealLevel: z.infer<typeof level>;
        supportedGoals: z.infer<typeof goal>[];
        primaryGoal: z.infer<typeof goal>;
      };
      return v.supportedGoals.includes(v.primaryGoal);
    }, 'supportedGoals must include primaryGoal')
    .refine((raw) => {
      const supportedGoals = (
        raw as unknown as {
          supportedGoals: z.infer<typeof goal>[];
        }
      ).supportedGoals;
      return new Set(supportedGoals).size === supportedGoals.length;
    }, 'supportedGoals must not contain duplicates')
    .refine((raw) => {
      const supportedLevels = (
        raw as unknown as {
          supportedLevels: z.infer<typeof level>[];
        }
      ).supportedLevels;
      return new Set(supportedLevels).size === supportedLevels.length;
    }, 'supportedLevels must not contain duplicates');
}

export const programAggregate = programChecks(programFields);
export const aggregateEdit = programChecks(
  programFields.omit({ slug: true }).extend({
    expectedVersion: z.number().int().positive(),
  }),
);
export const expectedVersion = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const programList = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  })
  .strict();
export const hintDraft = z
  .object({
    expectedVersion: z.number().int().positive(),
    originalText: text,
    structuredHints: z.record(z.string(), z.unknown()),
  })
  .strict();
export const hintApproval = expectedVersion;

export type ProgramAggregate = z.infer<typeof programAggregate>;
