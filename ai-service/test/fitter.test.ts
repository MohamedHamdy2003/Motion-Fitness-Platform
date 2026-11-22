import { describe, expect, it, vi } from 'vitest';

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
      return this.options.agents.aiProgramFitter;
    }
  },
}));

import {
  exerciseFittingInput,
  fitProgram,
} from '../src/agents/ai-program-fitter';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const exercise = {
  title: 'Example exercise',
  description: 'Exercise movement description',
  instructions: ['Example movement step'],
  muscleGroups: ['LEGS'],
  equipment: [],
};
const input = exerciseFittingInput.parse({
  policyVersion: 'reported-injury-fit-v1',
  injuries: [
    {
      bodyAreaCode: 'KNEE',
      side: 'LEFT',
      description: 'Reports symptoms on load',
    },
  ],
  exercises: [
    { workoutExerciseId: first, ...exercise },
    { workoutExerciseId: second, ...exercise },
  ],
});

describe('private program fitter', () => {
  it('returns only bounded structured assessments for each requested occurrence', async () => {
    generate.mockResolvedValueOnce({
      object: {
        decisions: [
          { workoutExerciseId: first, status: 'BLOCKED' },
          { workoutExerciseId: second, status: 'NEEDS_REVIEW' },
        ],
      },
    });
    const result = await fitProgram('fixture/model', input);
    expect(result).toMatchObject({
      modelVersion: 'fixture/model',
      policyVersion: input.policyVersion,
    });
    expect(result.decisions.map(({ status }) => status)).toEqual([
      'BLOCKED',
      'NEEDS_REVIEW',
    ]);
    expect(generate.mock.calls.at(-1)?.[1]).toMatchObject({
      maxSteps: 1,
      tracingOptions: { hideInput: true, hideOutput: true },
    });
  });

  it('rejects repeated or missing exercise IDs and identity or clinical fields', async () => {
    for (const decisions of [
      [{ workoutExerciseId: first, status: 'BLOCKED' }],
      [
        { workoutExerciseId: first, status: 'BLOCKED' },
        { workoutExerciseId: first, status: 'NEEDS_REVIEW' },
      ],
    ]) {
      generate.mockResolvedValueOnce({ object: { decisions } });
      await expect(fitProgram('fixture/model', input)).rejects.toThrow(
        'INVALID_FITTING_COVERAGE',
      );
    }
    expect(
      exerciseFittingInput.safeParse({ ...input, userId: 'not shared' })
        .success,
    ).toBe(false);
    generate.mockResolvedValueOnce({
      object: {
        decisions: [
          {
            workoutExerciseId: first,
            status: 'BLOCKED',
            diagnosis: 'untrusted',
          },
          { workoutExerciseId: second, status: 'NEEDS_REVIEW' },
        ],
      },
    });
    await expect(fitProgram('fixture/model', input)).rejects.toThrow();
  });
});
