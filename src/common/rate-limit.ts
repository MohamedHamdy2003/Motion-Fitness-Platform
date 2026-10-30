import { query } from '../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hash } from './crypto';
import { ApiError } from './http';
@Injectable()
export class RateLimit {
  constructor(@Inject(DataSource) private db: DataSource) {}
  async take(scope: string, identity: string, limit = 10, seconds = 900) {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const [r] = await query(
      this.db,
      `INSERT INTO rate_limits(key,bucket,count,expires_at) VALUES($1,$2,1,now()+($3*interval '1 second')) ON CONFLICT(key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`,
      [hash(scope + ':' + identity), bucket, seconds],
    );
    if (r.count > limit) throw new ApiError('RATE_LIMITED', 429);
  }
}
