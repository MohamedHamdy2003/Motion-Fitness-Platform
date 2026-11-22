import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { parse } from '../../common/http';
import { ContentGuard } from '../content/content.guard';
import { AnalyticsService } from './analytics.service';

const overviewQuery = z
  .object({
    days: z.coerce.number().int().min(1).max(90).default(30),
  })
  .strict();

@Controller('admin/analytics')
@UseGuards(AuthGuard, ContentGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('overview')
  overview(@Query() rawQuery: unknown) {
    const q = parse(overviewQuery, rawQuery);
    return this.analytics.overview(q.days);
  }

  @Post('uptime-check')
  @HttpCode(200)
  runUptimeCheck() {
    return this.analytics.runAndRecordUptimeCheck();
  }
}
