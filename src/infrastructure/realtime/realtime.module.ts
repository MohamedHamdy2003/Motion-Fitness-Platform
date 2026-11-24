import { Global, Module } from '@nestjs/common';
import { AdminEventsService } from './admin-events.service';

@Global()
@Module({
  providers: [AdminEventsService],
  exports: [AdminEventsService],
})
export class RealtimeModule {}
