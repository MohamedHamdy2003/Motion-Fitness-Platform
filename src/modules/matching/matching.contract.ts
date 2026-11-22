import { z } from 'zod';
import { ApiError } from '../../common/http';
import { createHash } from 'node:crypto';
export const policyVersion = 'matching-constraints-v1';
export const schemaVersion = 'matching-output-v1';
const code = z.string().regex(/^[A-Z][A-Z0-9_]{1,49}$/);
export const matchingProfile = z
  .object({
    primaryGoal: code,
    fitnessLevel: code,
    trainingDaysPerWeek: z.number().int().min(2).max(6),
    age: z.number().int().min(18).max(120),
    heightCm: z.number().positive().max(1000),
    weightKg: z.number().positive().max(10000),
    targetWeightKg: z.number().positive().max(10000),
    gender: code,
  })
  .strict();
export type MatchingProfile = z.infer<typeof matchingProfile>;
export type Candidate = {
  id: string;
  nutritionPlanVersionId: string;
  title: string;
  description: string;
  primaryGoal: string;
  supportedLevels: string[];
  trainingDaysPerWeek: number;
  requiredEquipment: string[];
  intendedAudience: string | null;
  approvedHints: unknown;
};
export const rulesetInput = z
  .object({
    instructionVersion: z.string().trim().min(1).max(100),
    instructions: z.string().trim().min(20).max(4000),
    model: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./:-]+$/)
      .max(160),
  })
  .strict();
export const publication = z
  .object({
    qualityApproved: z.literal(true),
    evaluationReference: z.string().trim().min(5).max(500),
  })
  .strict();
export const decisionSchema = z
  .object({
    status: z.enum(['MATCH', 'NO_MATCH']),
    selectedProgramVersionId: z.string().uuid().nullable(),
    reasonCodes: z
      .array(
        z.enum([
          'PROFILE_FIT',
          'GOAL_FIT',
          'LEVEL_FIT',
          'SCHEDULE_FIT',
          'NO_SUITABLE_PROGRAM',
        ]),
      )
      .min(1)
      .max(5),
  })
  .strict();
export class MatchingResponseValidator {
  validate(raw: unknown, candidates: Candidate[]) {
    const parsed = decisionSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('MATCHING_INVALID_OUTPUT', 502);
    const d = parsed.data;
    if (
      d.status === 'MATCH'
        ? !candidates.some((c) => c.id === d.selectedProgramVersionId) ||
          d.reasonCodes.includes('NO_SUITABLE_PROGRAM')
        : d.selectedProgramVersionId !== null ||
          d.reasonCodes.some((c) => c !== 'NO_SUITABLE_PROGRAM')
    )
      throw new ApiError('MATCHING_INVALID_OUTPUT', 502);
    return d;
  }
}
export class MetricsCalculator {
  calculate(p: MatchingProfile) {
    return {
      bmi: Number((p.weightKg / (p.heightCm / 100) ** 2).toFixed(2)),
      version: 'metrics-v1',
    };
  }
}
export function fingerprint(value: unknown) {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export type MatcherInput = {
  profile: MatchingProfile;
  metrics: { bmi: number; version: string };
  candidates: Candidate[];
  instructions: string;
  instructionVersion: string;
  model: string;
  policyVersion: typeof policyVersion;
  schemaVersion: typeof schemaVersion;
};
export interface ProgramMatcher {
  select(input: MatcherInput): Promise<unknown>;
}
export const PROGRAM_MATCHER = 'PROGRAM_MATCHER';
