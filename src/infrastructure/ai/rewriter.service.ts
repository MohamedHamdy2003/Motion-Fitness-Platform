import { query } from '../database/query';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import { injuryFields } from '../../modules/profiles/profile.dto';
import { AiUsageService, extractUsageFromHeaders } from './ai-usage.service';

export const rewriteInput = z
  .object({ ...injuryFields, draftVersion: z.number().int().nonnegative() })
  .strict();

export const rewriteOutput = z
  .object({
    description: z.string().trim().min(1).max(2000),
    modelVersion: z.string().min(1).max(200),
    instructionVersion: z.literal('injury-rewrite-v1'),
  })
  .strict();

export const programHintsRewriteOutput = z
  .object({
    structuredHints: z
      .object({
        summary: z.string().trim().min(1).max(1000),
        intendedAudience: z.string().trim().min(1).max(500),
        suitabilityNotes: z
          .array(z.string().trim().min(1).max(500))
          .min(1)
          .max(10),
        ambiguities: z.array(z.string().trim().min(1).max(500)).max(10),
        unsupportedClaims: z.array(z.string().trim().min(1).max(500)).max(10),
      })
      .strict(),
    modelVersion: z.string().min(1).max(200),
    instructionVersion: z.literal('program-hints-rewrite-v1'),
  })
  .strict();

export type ProgramHintsSnapshot = {
  title: string;
  description: string;
  primaryGoal: string;
  supportedLevels: string[];
  trainingDaysPerWeek: number;
  requiredEquipment: string[];
  intendedAudience: string | null;
  originalText: string;
};

@Injectable()
export class RewriterService {
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Optional()
    @Inject(AiUsageService)
    private readonly usage?: AiUsageService,
  ) {}

  private endpointUrl() {
    const env = environment();
    if (
      !env.AI_REWRITE_URL ||
      !env.AI_SERVICE_TOKEN ||
      env.AI_RETENTION_APPROVED !== 'true'
    )
      throw new ApiError('AI_REWRITE_NOT_CONFIGURED', 503);
    const url = new URL(env.AI_REWRITE_URL);
    const isInternalDocker =
      url.protocol === 'http:' &&
      (url.hostname === 'ai' || url.hostname === 'ai-service') &&
      url.port === '3001';
    if (
      url.protocol !== 'https:' &&
      !isInternalDocker &&
      env.NODE_ENV === 'production'
    )
      throw new ApiError('AI_REWRITE_NOT_CONFIGURED', 503);
    return { url, token: env.AI_SERVICE_TOKEN };
  }

  async preview(userId: string, input: z.infer<typeof rewriteInput>) {
    const { url, token } = this.endpointUrl();
    const started = Date.now();
    let failure: string | null = null;
    let output: z.infer<typeof rewriteOutput> | null = null;
    let tokenUsage = {
      model: process.env.AI_MODEL || 'google/gemini-2.5-flash',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'INJURY_DESCRIPTION',
          body_area_code: input.body_area_code,
          side: input.side ?? null,
          description: input.description,
        }),
        signal: AbortSignal.timeout(30000),
      });
      tokenUsage = extractUsageFromHeaders(response.headers, tokenUsage.model);
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        const diagnostic =
          typeof errorBody?.code === 'string' && errorBody.code.length <= 64
            ? errorBody.code
            : 'AI_REWRITE_UNAVAILABLE';
        throw new ApiError(diagnostic, 503);
      }
      const text = await response.text();
      if (text.length > 15000)
        throw new ApiError('AI_REWRITE_INVALID_OUTPUT', 502);
      const r = rewriteOutput.safeParse(JSON.parse(text));
      if (!r.success || r.data.description === input.description)
        throw new ApiError('AI_REWRITE_INVALID_OUTPUT', 502);
      output = r.data;
    } catch (error) {
      failure =
        error instanceof ApiError ? error.code : 'AI_REWRITE_UNAVAILABLE';
    }
    const latencyMs = Date.now() - started;
    // Metadata only: input drafts and unaccepted output never enter storage or logs.
    await query(
      this.db,
      `INSERT INTO ai_rewrite_runs(id,user_id,status,model_version,instruction_version,duration_ms,failure_code) VALUES($1,$2,$3,$4,'injury-rewrite-v1',$5,$6)`,
      [
        randomUUID(),
        userId,
        failure ? 'FAILED' : 'SUCCEEDED',
        output?.modelVersion || null,
        latencyMs,
        failure,
      ],
    );
    await this.usage?.record({
      operation: 'INJURY_REWRITE',
      model: output?.modelVersion || tokenUsage.model,
      status: failure ? 'FAILED' : 'SUCCEEDED',
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      latencyMs,
      failureCode: failure,
    });
    if (failure)
      throw new ApiError(
        failure,
        failure === 'AI_REWRITE_INVALID_OUTPUT' ? 502 : 503,
      );
    return {
      description: output!.description,
      draftVersion: input.draftVersion,
      instructionVersion: output!.instructionVersion,
      previewOnly: true,
    };
  }

  async previewProgramHints(userId: string, snapshot: ProgramHintsSnapshot) {
    const { url, token } = this.endpointUrl();
    const started = Date.now();
    let failure: string | null = null;
    let output: z.infer<typeof programHintsRewriteOutput> | null = null;
    let tokenUsage = {
      model: process.env.AI_MODEL || 'google/gemini-2.5-flash',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'PROGRAM_HINTS',
          ...snapshot,
        }),
        signal: AbortSignal.timeout(30000),
      });
      tokenUsage = extractUsageFromHeaders(response.headers, tokenUsage.model);
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        const diagnostic =
          typeof errorBody?.code === 'string' && errorBody.code.length <= 64
            ? errorBody.code
            : 'AI_REWRITE_UNAVAILABLE';
        throw new ApiError(diagnostic, 503);
      }
      const text = await response.text();
      if (text.length > 20000)
        throw new ApiError('AI_REWRITE_INVALID_OUTPUT', 502);
      const parsed = programHintsRewriteOutput.safeParse(JSON.parse(text));
      if (!parsed.success) throw new ApiError('AI_REWRITE_INVALID_OUTPUT', 502);
      output = parsed.data;
    } catch (error) {
      failure =
        error instanceof ApiError ? error.code : 'AI_REWRITE_UNAVAILABLE';
    }
    const latencyMs = Date.now() - started;
    await query(
      this.db,
      `INSERT INTO ai_rewrite_runs(id,user_id,status,model_version,instruction_version,duration_ms,failure_code) VALUES($1,$2,$3,$4,'program-hints-rewrite-v1',$5,$6)`,
      [
        randomUUID(),
        userId,
        failure ? 'FAILED' : 'SUCCEEDED',
        output?.modelVersion || null,
        latencyMs,
        failure,
      ],
    );
    await this.usage?.record({
      operation: 'PROGRAM_HINTS_REWRITE',
      model: output?.modelVersion || tokenUsage.model,
      status: failure ? 'FAILED' : 'SUCCEEDED',
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      latencyMs,
      failureCode: failure,
    });
    if (failure)
      throw new ApiError(
        failure,
        failure === 'AI_REWRITE_INVALID_OUTPUT' ? 502 : 503,
      );
    return {
      originalText: snapshot.originalText,
      structuredHints: output!.structuredHints,
      modelVersion: output!.modelVersion,
      instructionVersion: output!.instructionVersion,
      previewOnly: true,
    };
  }
}
