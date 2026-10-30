import { query } from '../database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import { injuryFields } from '../../modules/profiles/profile.dto';
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
@Injectable()
export class RewriterService {
  constructor(@Inject(DataSource) private db: DataSource) {}
  async preview(userId: string, input: z.infer<typeof rewriteInput>) {
    const env = environment();
    if (
      !env.AI_REWRITE_URL ||
      !env.AI_SERVICE_TOKEN ||
      env.AI_RETENTION_APPROVED !== 'true'
    )
      throw new ApiError('AI_REWRITE_NOT_CONFIGURED', 503);
    const started = Date.now();
    let failure: string | null = null;
    let output: z.infer<typeof rewriteOutput> | null = null;
    try {
      const url = new URL(env.AI_REWRITE_URL);
      if (
        url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          url.hostname === 'ai' &&
          url.port === '3001'
        ) &&
        env.NODE_ENV === 'production'
      )
        throw new ApiError('AI_REWRITE_NOT_CONFIGURED', 503);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.AI_SERVICE_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'INJURY_DESCRIPTION',
          body_area_code: input.body_area_code,
          side: input.side ?? null,
          description: input.description,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new ApiError('AI_REWRITE_UNAVAILABLE', 503);
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
    // Metadata only: input drafts and unaccepted output never enter storage or logs.
    await query(
      this.db,
      `INSERT INTO ai_rewrite_runs(id,user_id,status,model_version,instruction_version,duration_ms,failure_code) VALUES($1,$2,$3,$4,'injury-rewrite-v1',$5,$6)`,
      [
        randomUUID(),
        userId,
        failure ? 'FAILED' : 'SUCCEEDED',
        output?.modelVersion || null,
        Date.now() - started,
        failure,
      ],
    );
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
}
