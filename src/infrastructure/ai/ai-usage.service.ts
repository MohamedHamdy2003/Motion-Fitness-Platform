import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { query } from '../database/query';

export type AiOperation =
  | 'PROGRAM_MATCHING'
  | 'EXERCISE_FITTING'
  | 'INJURY_REWRITE'
  | 'PROGRAM_HINTS_REWRITE';

export interface AiUsageRecord {
  operation: AiOperation;
  model: string;
  status: 'SUCCEEDED' | 'FAILED';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  failureCode?: string | null;
}

export function extractUsageFromHeaders(
  headers: Headers,
  fallbackModel = 'google/gemini-2.5-flash',
) {
  const inputTokens = Math.max(
    0,
    Number.parseInt(headers.get('x-ai-input-tokens') || '0', 10) || 0,
  );
  const outputTokens = Math.max(
    0,
    Number.parseInt(headers.get('x-ai-output-tokens') || '0', 10) || 0,
  );
  const totalHeader =
    Number.parseInt(headers.get('x-ai-total-tokens') || '0', 10) || 0;
  const totalTokens = Math.max(inputTokens + outputTokens, totalHeader);
  const model = headers.get('x-ai-model') || fallbackModel;
  return { model, inputTokens, outputTokens, totalTokens };
}

export function estimateGeminiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const normalized = model.toLowerCase();
  let inputPerMillion = 0.3;
  let outputPerMillion = 2.5;
  if (normalized.includes('pro')) {
    inputPerMillion = 1.25;
    outputPerMillion = 10.0;
  } else if (normalized.includes('3.8-flash')) {
    inputPerMillion = 0.75;
    outputPerMillion = 3.75;
  } else if (normalized.includes('3.6-flash')) {
    inputPerMillion = 1.5;
    outputPerMillion = 7.5;
  } else if (normalized.includes('3.5-flash-lite')) {
    inputPerMillion = 0.3;
    outputPerMillion = 2.5;
  } else if (
    normalized.includes('2.5-flash-lite') ||
    normalized.includes('2.0-flash')
  ) {
    inputPerMillion = 0.1;
    outputPerMillion = 0.4;
  } else if (normalized.includes('2.5-flash')) {
    inputPerMillion = 0.15;
    outputPerMillion = 0.6;
  }
  const cost =
    (Math.max(0, inputTokens) / 1_000_000) * inputPerMillion +
    (Math.max(0, outputTokens) / 1_000_000) * outputPerMillion;
  return Number(cost.toFixed(6));
}

@Injectable()
export class AiUsageService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async record(entry: AiUsageRecord): Promise<void> {
    const inputTokens = Math.max(0, Math.round(entry.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.round(entry.outputTokens ?? 0));
    const totalTokens = Math.max(
      inputTokens + outputTokens,
      Math.round(entry.totalTokens ?? inputTokens + outputTokens),
    );
    const model = entry.model || 'google/gemini-2.5-flash';
    const estimatedCostUsd = estimateGeminiCostUsd(
      model,
      inputTokens,
      outputTokens,
    );
    const latencyMs = Math.max(0, Math.round(entry.latencyMs));

    try {
      await query(
        this.db,
        `INSERT INTO ai_usage_logs(
           id, operation, model, status,
           input_tokens, output_tokens, total_tokens,
           estimated_cost_usd, latency_ms, failure_code
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          entry.operation,
          model,
          entry.status,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostUsd,
          latencyMs,
          entry.failureCode ?? null,
        ],
      );
    } catch {
      // Telemetry must never interrupt user-facing AI execution.
    }
  }
}
