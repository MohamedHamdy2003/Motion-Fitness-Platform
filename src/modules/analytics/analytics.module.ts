import { Module } from '@nestjs/common';
import { ContentGuard } from '../content/content.guard';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController, AdminUsersController],
  providers: [AnalyticsService, AdminUsersService, ContentGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
