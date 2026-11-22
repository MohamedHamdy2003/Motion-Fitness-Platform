import { describe, it, expect, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
vi.mock('@mastra/core/mastra', () => ({
  Mastra: class {
    constructor(private options: any) {}
    getAgent() {
      return this.options.agents.aiRewriter;
    }
  },
}));
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate = generate;
  },
}));
import { rewrite, inputSchema } from '../src/agents/ai-rewriter';
describe('private injury and program-hints rewriter', () => {
  it('returns validated structured output with versions for injury descriptions', async () => {
    generate.mockResolvedValue({
      object: { description: 'My left knee hurts occasionally.' },
    });
    expect(
      await rewrite('fixture/model', {
        mode: 'INJURY_DESCRIPTION',
        body_area_code: 'KNEE',
        side: 'LEFT',
        description: 'left knee hurts sometimes',
      }),
    ).toEqual({
      description: 'My left knee hurts occasionally.',
      modelVersion: 'fixture/model',
      instructionVersion: 'injury-rewrite-v1',
    });
  });

  it('extracts structured program hints in PROGRAM_HINTS mode', async () => {
    generate.mockResolvedValueOnce({
      object: {
        summary:
          'Three-day full-body fat loss template with low-impact movements.',
        intendedAudience: 'Beginners and intermediates seeking steady fat loss',
        suitabilityNotes: [
          'Low-impact lower body progressions',
          'Minimal equipment',
        ],
        ambiguities: [],
        unsupportedClaims: [],
      },
    });
    const result = await rewrite('google/gemini-2.5-flash', {
      mode: 'PROGRAM_HINTS',
      title: 'Fat Loss Foundation 3D',
      description: 'Three days of metabolic resistance training.',
      primaryGoal: 'FAT_LOSS',
      supportedLevels: ['BEGINNER', 'INTERMEDIATE'],
      trainingDaysPerWeek: 3,
      requiredEquipment: ['DUMBBELL'],
      intendedAudience: 'Beginners and intermediates',
      originalText:
        'Best for users starting fat loss with dumbbells 3 days a week.',
    });
    expect(result).toEqual({
      structuredHints: {
        summary:
          'Three-day full-body fat loss template with low-impact movements.',
        intendedAudience: 'Beginners and intermediates seeking steady fat loss',
        suitabilityNotes: [
          'Low-impact lower body progressions',
          'Minimal equipment',
        ],
        ambiguities: [],
        unsupportedClaims: [],
      },
      modelVersion: 'google/gemini-2.5-flash',
      instructionVersion: 'program-hints-rewrite-v1',
    });
  });

  it('rejects unchanged text and malformed outputs', async () => {
    const input = {
      mode: 'INJURY_DESCRIPTION' as const,
      body_area_code: 'KNEE',
      side: 'LEFT' as const,
      description: 'unchanged',
    };
    generate.mockResolvedValueOnce({ object: { description: 'unchanged' } });
    await expect(rewrite('fixture/model', input)).rejects.toThrow('UNCHANGED');
    generate.mockResolvedValueOnce({ object: { diagnosis: 'invented' } });
    await expect(rewrite('fixture/model', input)).rejects.toThrow();
  });
  it('has no identity or database fields in its contract', () => {
    expect(
      inputSchema.safeParse({
        mode: 'INJURY_DESCRIPTION',
        body_area_code: 'KNEE',
        side: null,
        description: 'pain',
        userId: 'secret',
      }).success,
    ).toBe(false);
  });
});
