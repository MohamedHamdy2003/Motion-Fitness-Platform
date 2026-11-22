import { describe, it, expect, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate = generate;
  },
}));
vi.mock('@mastra/core/mastra', () => ({
  Mastra: class {
    constructor(private options: any) {}
    getAgent() {
      return this.options.agents.aiAssistedMatcher;
    }
  },
}));
import { matchProgram, matchingInput } from '../src/agents/ai-assisted-matcher';
const id = '00000000-0000-4000-8000-000000000001';
const input = {
  profile: {
    primaryGoal: 'FAT_LOSS',
    fitnessLevel: 'BEGINNER',
    trainingDaysPerWeek: 2,
    age: 28,
    heightCm: 175,
    weightKg: 80,
    targetWeightKg: 72,
    gender: 'FEMALE',
  },
  metrics: { bmi: 26.12, version: 'metrics-v1' as const },
  candidates: [
    {
      id,
      nutritionPlanVersionId: id,
      title: 'Admin program',
      description: 'Two days of beginner training',
      primaryGoal: 'FAT_LOSS',
      supportedLevels: ['BEGINNER'],
      trainingDaysPerWeek: 2,
      requiredEquipment: [],
      intendedAudience: null,
      approvedHints: null,
    },
  ],
  instructions: 'Compare eligible candidates only.',
  instructionVersion: 'test-v1',
  model: 'fixture/model',
  policyVersion: 'matching-constraints-v1' as const,
  schemaVersion: 'matching-output-v1' as const,
};
describe('private program selector', () => {
  it('selects only supplied candidate IDs with a bounded, structured agent', async () => {
    generate.mockResolvedValue({
      object: {
        status: 'MATCH',
        selectedProgramVersionId: id,
        reasonCodes: ['GOAL_FIT'],
      },
    });
    expect(
      (await matchProgram('fixture/model', input)).selectedProgramVersionId,
    ).toBe(id);
    expect(generate.mock.calls.at(-1)?.[1]).toMatchObject({
      maxSteps: 1,
      tracingOptions: { hideInput: true, hideOutput: true },
    });
  });
  it('rejects forged candidates, model drift and direct identity fields', async () => {
    generate.mockResolvedValue({
      object: {
        status: 'MATCH',
        selectedProgramVersionId: '00000000-0000-4000-8000-000000000002',
        reasonCodes: ['GOAL_FIT'],
      },
    });
    await expect(matchProgram('fixture/model', input)).rejects.toThrow(
      'INVALID_SELECTION',
    );
    await expect(matchProgram('other/model', input)).rejects.toThrow(
      'MODEL_MISMATCH',
    );
    expect(
      matchingInput.safeParse({ ...input, userId: 'private' }).success,
    ).toBe(false);
  });
});
