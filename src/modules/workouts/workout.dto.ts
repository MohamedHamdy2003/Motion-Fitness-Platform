import { z } from 'zod';

const measurement = {
  actualReps: z.number().int().min(0).max(500).optional(),
  weightKg: z.number().min(0).max(1000).optional(),
  durationSeconds: z.number().int().min(1).max(86400).optional(),
};

export const workoutSetInput = z.discriminatedUnion('status', [
  z.object({ status: z.literal('COMPLETED'), ...measurement }).strict(),
  z.object({ status: z.literal('SKIPPED') }).strict(),
]);
export type WorkoutSetInput = z.infer<typeof workoutSetInput>;
export const workoutSetNumber = z.coerce.number().int().min(1).max(100);
export const exerciseCompletionInput = z
  .object({ completed: z.boolean() })
  .strict();
