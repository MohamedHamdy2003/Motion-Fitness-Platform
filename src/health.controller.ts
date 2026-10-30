import { query } from './infrastructure/database/query';
import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from './common/http';
import { environment } from './config/environment';
@Controller('health')
export class HealthController {
  constructor(@Inject(DataSource) private db: DataSource) {}
  @Get() live() {
    return { status: 'ok', version: '0.1.0' };
  }
  @Get('ready') async ready() {
    try {
      await query(this.db, 'SELECT 1');
      const [lookup] = await query(
        this.db,
        `SELECT code FROM roles WHERE code='ATHLETE'`,
      );
      if (!lookup) throw Error();
      const pending = await this.db.showMigrations();
      if (pending) throw Error();
    } catch {
      throw new ApiError('NOT_READY', 503);
    }
    const e = environment();
    return {
      status: 'ready',
      dependencies: {
        database: 'CONNECTED',
        email: ['resend', 'smtp'].includes(e.MAIL_MODE)
          ? 'CONFIGURED_UNVERIFIED'
          : e.MAIL_MODE === 'capture'
            ? 'LOCAL_CAPTURE'
            : 'NOT_CONFIGURED',
        aiRewrite:
          e.AI_REWRITE_URL && e.AI_RETENTION_APPROVED === 'true'
            ? 'CONFIGURED_UNVERIFIED'
            : 'NOT_CONFIGURED',
      },
    };
  }
}
