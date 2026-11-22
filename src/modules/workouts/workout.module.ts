import { Module } from '@nestjs/common';
import { ProgramEnrollmentsModule } from '../enrollments/program-enrollments.module';
import { FittingModule } from '../fitting/fitting.module';
import { WorkoutController } from './workout.controller';
import { WorkoutService } from './workout.service';

@Module({
  imports: [ProgramEnrollmentsModule, FittingModule],
  controllers: [WorkoutController],
  providers: [WorkoutService],
})
export class WorkoutModule {}
