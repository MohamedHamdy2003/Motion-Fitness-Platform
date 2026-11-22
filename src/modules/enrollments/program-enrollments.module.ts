import { Module } from '@nestjs/common';
import { FittingModule } from '../fitting/fitting.module';
import { MediaModule } from '../media/media.module';
import { ProgramEnrollmentController } from './program-enrollment.controller';
import { ProgramEnrollmentService } from './program-enrollment.service';

@Module({
  imports: [FittingModule, MediaModule],
  controllers: [ProgramEnrollmentController],
  providers: [ProgramEnrollmentService],
  exports: [ProgramEnrollmentService],
})
export class ProgramEnrollmentsModule {}
