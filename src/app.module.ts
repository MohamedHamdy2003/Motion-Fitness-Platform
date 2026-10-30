import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './infrastructure/database/database.options';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profiles/profile.module';
import { MediaModule } from './modules/media/media.module';
import { JobsService } from './infrastructure/jobs/jobs.service';
import { HealthController } from './health.controller';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: databaseOptions }),
    CommonModule,
    AuthModule,
    ProfileModule,
    MediaModule,
  ],
  controllers: [HealthController],
  providers: [JobsService],
})
export class AppModule {}
