import { Inject, Injectable, Optional } from '@nestjs/common';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import {
  AiUsageService,
  extractUsageFromHeaders,
} from '../../infrastructure/ai/ai-usage.service';
import { ProgramMatcher, MatcherInput } from './matching.contract';

@Injectable()
export class AiAssistedMatcher implements ProgramMatcher {
  constructor(
    @Optional()
    @Inject(AiUsageService)
    private readonly usage?: AiUsageService,
  ) {}

  async select(input: MatcherInput): Promise<unknown> {
    const e = environment();
    if (
      !e.AI_MATCHING_URL ||
      !e.AI_SERVICE_TOKEN ||
      e.AI_RETENTION_APPROVED !== 'true'
    )
      throw new ApiError('AI_MATCHING_NOT_CONFIGURED', 503);
    const url = new URL(e.AI_MATCHING_URL);
    const isInternalDocker =
      url.protocol === 'http:' &&
      (url.hostname === 'ai' || url.hostname === 'ai-service') &&
      url.port === '3001';
    if (
      e.NODE_ENV === 'production' &&
      url.protocol !== 'https:' &&
      !isInternalDocker
    )
      throw new ApiError('AI_MATCHING_NOT_CONFIGURED', 503);
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body, 'utf8') > 512000)
      throw new ApiError('MATCHING_CONTEXT_TOO_LARGE', 422);

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${e.AI_SERVICE_TOKEN}`,
          'content-type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      await this.usage?.record({
        operation: 'PROGRAM_MATCHING',
        model: input.model,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'AI_MATCHING_UNAVAILABLE',
      });
      throw new ApiError('AI_MATCHING_UNAVAILABLE', 503);
    }

    const headerUsage = extractUsageFromHeaders(response.headers, input.model);
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      const diagnosticCode =
        typeof errorBody?.code === 'string' && errorBody.code.length <= 64
          ? errorBody.code
          : `HTTP_${response.status}`;
      await this.usage?.record({
        operation: 'PROGRAM_MATCHING',
        model: headerUsage.model,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: diagnosticCode,
      });
      throw new ApiError('AI_MATCHING_UNAVAILABLE', 503);
    }
    const text = await response.text();
    if (text.length > 12000) {
      await this.usage?.record({
        operation: 'PROGRAM_MATCHING',
        ...headerUsage,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'MATCHING_INVALID_OUTPUT',
      });
      throw new ApiError('MATCHING_INVALID_OUTPUT', 502);
    }
    try {
      const parsed = JSON.parse(text);
      await this.usage?.record({
        operation: 'PROGRAM_MATCHING',
        ...headerUsage,
        status: 'SUCCEEDED',
        latencyMs: Date.now() - started,
      });
      return parsed;
    } catch {
      await this.usage?.record({
        operation: 'PROGRAM_MATCHING',
        ...headerUsage,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'MATCHING_INVALID_OUTPUT',
      });
      throw new ApiError('MATCHING_INVALID_OUTPUT', 502);
    }
  }
}
