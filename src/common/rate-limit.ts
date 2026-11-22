import { query } from '../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hash } from './crypto';
import { ApiError, RateLimitMeta } from './http';

@Injectable()
export class RateLimit {
  constructor(@Inject(DataSource) private db: DataSource) {}

  async take(
    scope: string,
    identity: string,
    limit = 10,
    seconds = 900,
  ): Promise<RateLimitMeta> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSeconds / seconds);
    const resetAt = (bucket + 1) * seconds;
    const retryAfterSeconds = Math.max(1, resetAt - nowSeconds);
    const [r] = await query(
      this.db,
      `INSERT INTO rate_limits(key,bucket,count,expires_at) VALUES($1,$2,1,now()+($3*interval '1 second')) ON CONFLICT(key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`,
      [hash(scope + ':' + identity), bucket, seconds],
    );
    const meta: RateLimitMeta = {
      limit,
      remaining: Math.max(0, limit - Number(r.count)),
      resetAt,
      retryAfterSeconds,
    };
    if (r.count > limit) {
      throw new ApiError('RATE_LIMITED', 429, undefined, null, meta);
    }
    return meta;
  }
}
