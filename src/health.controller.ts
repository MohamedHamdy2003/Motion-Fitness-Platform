import { query } from './infrastructure/database/query';
import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from './common/http';
import { environment } from './config/environment';

const startedAt = new Date().toISOString();

@Controller('health')
export class HealthController {
  constructor(@Inject(DataSource) private db: DataSource) {}
  @Get() live() {
    return {
      status: 'ok',
      version: '0.4.0',
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt,
    };
  }
  @Get('ready') async ready() {
    const dbStart = Date.now();
    let databaseLatencyMs = 0;
    try {
      await query(this.db, 'SELECT 1');
      databaseLatencyMs = Date.now() - dbStart;
      const [lookup] = await query(
        this.db,
        `SELECT code FROM roles WHERE code='USER'`,
      );
      if (!lookup) throw Error();
      const pending = await this.db.showMigrations();
      if (pending) throw Error();
    } catch {
      throw new ApiError('NOT_READY', 503);
    }
    const e = environment();
    const aiStatus = (url: string) =>
      url && e.AI_SERVICE_TOKEN && e.AI_RETENTION_APPROVED === 'true'
        ? 'CONFIGURED_UNVERIFIED'
        : 'NOT_CONFIGURED';
    return {
      status: 'ready',
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt,
      databaseLatencyMs,
      dependencies: {
        database: 'CONNECTED',
        email: ['resend', 'smtp'].includes(e.MAIL_MODE)
          ? 'CONFIGURED_UNVERIFIED'
          : e.MAIL_MODE === 'capture'
            ? 'LOCAL_CAPTURE'
            : 'NOT_CONFIGURED',
        aiRewrite: aiStatus(e.AI_REWRITE_URL),
        aiMatching: aiStatus(e.AI_MATCHING_URL),
        aiFitting: aiStatus(e.AI_FITTING_URL),
      },
    };
  }
}
