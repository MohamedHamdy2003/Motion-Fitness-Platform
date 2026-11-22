import { z } from 'zod';

const localDate = z.iso.date();

export const dailyActivityQuery = z
  .object({ date: localDate.optional() })
  .strict();

export const waterLogInput = z
  .object({ milliliters: z.number().int().min(1).max(2000).default(250) })
  .strict();

export const dailyStepsInput = z
  .object({
    date: localDate.optional(),
    steps: z.number().int().min(0).max(200000).optional(),
    manuallyCompleted: z.boolean().optional(),
  })
  .strict()
  .refine(
    ({ steps, manuallyCompleted }) =>
      steps !== undefined || manuallyCompleted !== undefined,
    'Send steps or manuallyCompleted',
  );

export const activityGoalsInput = z
  .object({
    waterGoalMl: z.number().int().min(250).max(10000).nullable(),
    stepsGoal: z.number().int().min(100).max(100000).nullable(),
  })
  .strict();
