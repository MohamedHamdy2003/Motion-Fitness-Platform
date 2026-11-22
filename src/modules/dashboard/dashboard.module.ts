import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { ProgramEnrollmentsModule } from '../enrollments/program-enrollments.module';
import { UserNutritionModule } from '../nutrition/nutrition.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ProgramEnrollmentsModule, UserNutritionModule, ActivityModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
