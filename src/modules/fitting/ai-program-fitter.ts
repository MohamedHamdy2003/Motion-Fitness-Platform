import { Inject, Injectable, Optional } from '@nestjs/common';
import { ApiError } from '../../common/http';
import { environment } from '../../config/environment';
import {
  AiUsageService,
  extractUsageFromHeaders,
} from '../../infrastructure/ai/ai-usage.service';
import { FittingInput, validateFittingOutput } from './fitting.contract';

@Injectable()
export class AiProgramFitter {
  constructor(
    @Optional()
    @Inject(AiUsageService)
    private readonly usage?: AiUsageService,
  ) {}

  private provider() {
    const config = environment();
    const url =
      config.AI_FITTING_URL && URL.canParse(config.AI_FITTING_URL)
        ? new URL(config.AI_FITTING_URL)
        : null;
    if (
      !url ||
      !config.AI_SERVICE_TOKEN ||
      config.AI_RETENTION_APPROVED !== 'true'
    )
      return null;
    const isInternalDocker =
      url.protocol === 'http:' &&
      (url.hostname === 'ai' || url.hostname === 'ai-service') &&
      url.port === '3001';
    if (
      config.NODE_ENV === 'production' &&
      url.protocol !== 'https:' &&
      !isInternalDocker
    )
      return null;
    return { url, token: config.AI_SERVICE_TOKEN };
  }

  available() {
    return this.provider() !== null;
  }

  async assess(input: FittingInput) {
    const provider = this.provider();
    if (!provider) throw new ApiError('AI_FITTING_NOT_CONFIGURED', 503);
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body, 'utf8') > 256000)
      throw new ApiError('FITTING_CONTEXT_TOO_LARGE', 422);

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${provider.token}`,
          'content-type': 'application/json',
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      await this.usage?.record({
        operation: 'EXERCISE_FITTING',
        model: process.env.AI_MODEL || 'google/gemini-2.5-flash',
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'AI_FITTING_UNAVAILABLE',
      });
      throw new ApiError('AI_FITTING_UNAVAILABLE', 503);
    }

    const headerUsage = extractUsageFromHeaders(
      response.headers,
      process.env.AI_MODEL || 'google/gemini-2.5-flash',
    );
    if (!response.ok) {
      await this.usage?.record({
        operation: 'EXERCISE_FITTING',
        model: headerUsage.model,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'AI_FITTING_UNAVAILABLE',
      });
      throw new ApiError('AI_FITTING_UNAVAILABLE', 503);
    }
    const raw = await response.text();
    if (raw.length > 12000) {
      await this.usage?.record({
        operation: 'EXERCISE_FITTING',
        ...headerUsage,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'FITTING_INVALID_OUTPUT',
      });
      throw new ApiError('FITTING_INVALID_OUTPUT', 502);
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      await this.usage?.record({
        operation: 'EXERCISE_FITTING',
        ...headerUsage,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'FITTING_INVALID_OUTPUT',
      });
      throw new ApiError('FITTING_INVALID_OUTPUT', 502);
    }
    const output = validateFittingOutput(value, input.exercises);
    if (!output) {
      await this.usage?.record({
        operation: 'EXERCISE_FITTING',
        ...headerUsage,
        status: 'FAILED',
        latencyMs: Date.now() - started,
        failureCode: 'FITTING_INVALID_OUTPUT',
      });
      throw new ApiError('FITTING_INVALID_OUTPUT', 502);
    }
    await this.usage?.record({
      operation: 'EXERCISE_FITTING',
      ...headerUsage,
      model: output.modelVersion || headerUsage.model,
      status: 'SUCCEEDED',
      latencyMs: Date.now() - started,
    });
    return output;
  }
}
