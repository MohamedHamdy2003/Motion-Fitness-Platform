import { Global, Module } from '@nestjs/common';
import { AiUsageService } from '../infrastructure/ai/ai-usage.service';
import { AuthGuard } from './auth.guard';
import { RateLimit } from './rate-limit';
@Global()
@Module({
  providers: [AuthGuard, RateLimit, AiUsageService],
  exports: [AuthGuard, RateLimit, AiUsageService],
})
export class CommonModule {}
