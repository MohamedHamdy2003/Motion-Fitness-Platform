export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function extractTokenUsage(raw: unknown): AiTokenUsage {
  if (!raw || typeof raw !== 'object') {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const u = raw as Record<string, unknown>;
  const inputTokens = Math.max(
    0,
    Math.round(Number(u.inputTokens ?? u.promptTokens ?? 0) || 0),
  );
  const outputTokens = Math.max(
    0,
    Math.round(Number(u.outputTokens ?? u.completionTokens ?? 0) || 0),
  );
  const totalRaw = Number(u.totalTokens ?? inputTokens + outputTokens) || 0;
  const totalTokens = Math.max(
    inputTokens + outputTokens,
    Math.round(totalRaw),
  );
  return { inputTokens, outputTokens, totalTokens };
}
