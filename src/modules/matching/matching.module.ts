import {
  Module,
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ProgramMatchingService } from './program-matching.service';
import { AiAssistedMatcher } from './ai-assisted-matcher';
import { PROGRAM_MATCHER } from './matching.contract';
import {
  MatchingController,
  AdminMatchingController,
} from './matching.controller';
import { ContentGuard } from '../content/content.guard';
import { environment } from '../../config/environment';
@Injectable()
class MatchingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private busy = false;
  constructor(
    @Inject(ProgramMatchingService) private matching: ProgramMatchingService,
  ) {}
  onApplicationBootstrap() {
    if (environment().NODE_ENV !== 'test')
      this.timer = setInterval(() => {
        if (!this.busy) {
          this.busy = true;
          void this.matching
            .processOne()
            .catch(() => undefined)
            .finally(() => {
              this.busy = false;
            });
        }
      }, 3000).unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}
@Module({
  controllers: [MatchingController, AdminMatchingController],
  providers: [
    ProgramMatchingService,
    { provide: PROGRAM_MATCHER, useClass: AiAssistedMatcher },
    MatchingWorker,
    ContentGuard,
  ],
  exports: [ProgramMatchingService],
})
export class MatchingModule {}
