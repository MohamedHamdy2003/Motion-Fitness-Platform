import { MatchingModule } from './modules/matching/matching.module';
import { ActivityModule } from './modules/activity/activity.module';
import { WorkoutModule } from './modules/workouts/workout.module';
import { UserNutritionModule } from './modules/nutrition/nutrition.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SupportModule } from './modules/support/support.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ContentModule } from './modules/content/content.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './infrastructure/database/database.options';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profiles/profile.module';
import { MediaModule } from './modules/media/media.module';
import { JobsService } from './infrastructure/jobs/jobs.service';
import { HealthController } from './health.controller';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: databaseOptions }),
    RealtimeModule,
    CommonModule,
    AuthModule,
    ProfileModule,
    MediaModule,
    SupportModule,
    AnalyticsModule,
    ContentModule,
    MatchingModule,
    ActivityModule,
    WorkoutModule,
    UserNutritionModule,
    DashboardModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [JobsService],
})
export class AppModule {}
