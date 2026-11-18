import { Injectable } from '@nestjs/common';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import { ProgramMatcher, MatcherInput } from './matching.contract';
@Injectable()
export class AiAssistedMatcher implements ProgramMatcher {
  async select(input: MatcherInput): Promise<unknown> {
    const e = environment();
    if (
      !e.AI_MATCHING_URL ||
      !e.AI_SERVICE_TOKEN ||
      e.AI_RETENTION_APPROVED !== 'true'
    )
      throw new ApiError('AI_MATCHING_NOT_CONFIGURED', 503);
    const url = new URL(e.AI_MATCHING_URL);
    if (
      e.NODE_ENV === 'production' &&
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        url.hostname === 'ai' &&
        url.port === '3001'
      )
    )
      throw new ApiError('AI_MATCHING_NOT_CONFIGURED', 503);
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body, 'utf8') > 512000)
      throw new ApiError('MATCHING_CONTEXT_TOO_LARGE', 422);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${e.AI_SERVICE_TOKEN}`,
        'content-type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError('AI_MATCHING_UNAVAILABLE', 503);
    const text = await response.text();
    if (text.length > 12000) throw new ApiError('MATCHING_INVALID_OUTPUT', 502);
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError('MATCHING_INVALID_OUTPUT', 502);
    }
  }
}
