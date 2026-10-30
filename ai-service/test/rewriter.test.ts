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
describe('private injury rewriter', () => {
  it('returns validated structured output with versions', async () => {
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
