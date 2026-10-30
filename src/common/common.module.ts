import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { RateLimit } from './rate-limit';
@Global()
@Module({ providers: [AuthGuard, RateLimit], exports: [AuthGuard, RateLimit] })
export class CommonModule {}
