import { z } from 'zod';

export const fittingPolicyVersion = 'reported-injury-fit-v1';

export const fittingInput = z
  .object({
    policyVersion: z.literal(fittingPolicyVersion),
    injuries: z
      .array(
        z
          .object({
            bodyAreaCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,49}$/),
            side: z.enum(['LEFT', 'RIGHT', 'BOTH', 'UNSPECIFIED']).nullable(),
            description: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    exercises: z
      .array(
        z
          .object({
            workoutExerciseId: z.uuid(),
            title: z.string().trim().min(1).max(4000),
            description: z.string().trim().min(1).max(4000),
            instructions: z
              .array(z.string().trim().min(1).max(4000))
              .min(1)
              .max(50),
            muscleGroups: z.array(z.string().max(100)).max(100),
            equipment: z.array(z.string().max(100)).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

const decisionSchema = z
  .object({
    workoutExerciseId: z.uuid(),
    status: z.enum(['NO_IDENTIFIED_CONFLICT', 'BLOCKED', 'NEEDS_REVIEW']),
  })
  .strict();
const providerResponse = z
  .object({
    policyVersion: z.literal(fittingPolicyVersion),
    modelVersion: z.string().min(1).max(200),
    decisions: z.array(decisionSchema).min(1).max(50),
  })
  .strict();

export type FittingInput = z.infer<typeof fittingInput>;
export type ExerciseDecision = z.infer<typeof decisionSchema>;
export type ExerciseFittingResult = {
  status:
    | 'NOT_REQUIRED'
    | 'PENDING'
    | 'RUNNING'
    | 'READY'
    | 'NEEDS_REVIEW'
    | 'FAILED';
  runId: string | null;
  decisions: ExerciseDecision[];
  failureCode: string | null;
};

export function validateFittingOutput(
  value: unknown,
  exercises: FittingInput['exercises'],
) {
  const parsed = providerResponse.safeParse(value);
  if (!parsed.success || parsed.data.decisions.length !== exercises.length)
    return null;
  const byId = new Map(
    parsed.data.decisions.map((item) => [item.workoutExerciseId, item]),
  );
  if (
    byId.size !== exercises.length ||
    exercises.some((exercise) => !byId.has(exercise.workoutExerciseId))
  )
    return null;
  return {
    modelVersion: parsed.data.modelVersion,
    decisions: exercises.map((exercise) =>
      byId.get(exercise.workoutExerciseId)!,
    ),
  };
}
