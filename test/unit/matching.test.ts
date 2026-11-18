import { describe, it, expect } from 'vitest';
import {
  MatchingResponseValidator,
  MetricsCalculator,
  rulesetInput,
  fingerprint,
} from '../../src/modules/matching/matching.contract';
const v = new MatchingResponseValidator();
describe('matching constraints', () => {
  it('hashes JSONB snapshots without depending on object key order', () => {
    expect(fingerprint({ x: 1, a: { z: 2, b: 3 } })).toBe(
      fingerprint({ a: { b: 3, z: 2 }, x: 1 }),
    );
  });
  it('rejects candidate forgery and inconsistent no-match decisions', () => {
    expect(() =>
      v.validate(
        {
          status: 'MATCH',
          selectedProgramVersionId: '00000000-0000-4000-8000-000000000001',
          reasonCodes: ['GOAL_FIT'],
        },
        [],
      ),
    ).toThrow();
    expect(() =>
      v.validate(
        {
          status: 'NO_MATCH',
          selectedProgramVersionId: null,
          reasonCodes: ['GOAL_FIT'],
        },
        [],
      ),
    ).toThrow();
    expect(
      v.validate(
        {
          status: 'NO_MATCH',
          selectedProgramVersionId: null,
          reasonCodes: ['NO_SUITABLE_PROGRAM'],
        },
        [],
      ).status,
    ).toBe('NO_MATCH');
  });
  it('keeps BMI contextual and accepts no executable eligibility rules', () => {
    expect(
      new MetricsCalculator().calculate({ weightKg: 80, heightCm: 200 } as any),
    ).toEqual({ bmi: 20, version: 'metrics-v1' });
    expect(
      rulesetInput.safeParse({
        instructionVersion: 'v1',
        instructions: 'Compare valid candidates only.',
        model: 'fixture/model',
        sql: 'DROP TABLE users',
      }).success,
    ).toBe(false);
  });
});
