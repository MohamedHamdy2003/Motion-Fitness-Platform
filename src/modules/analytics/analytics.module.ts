import { Module } from '@nestjs/common';
import { ContentGuard } from '../content/content.guard';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ContentGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
