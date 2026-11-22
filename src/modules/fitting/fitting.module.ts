import {
  Inject,
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { environment } from '../../config/environment';
import { AiProgramFitter } from './ai-program-fitter';
import { FittingController } from './fitting.controller';
import { ExerciseFittingService } from './fitting.service';

@Injectable()
class FittingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(ExerciseFittingService)
    private readonly fitting: ExerciseFittingService,
  ) {}

  onApplicationBootstrap() {
    if (environment().NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.fitting
        .processOne()
        .catch(() => undefined)
        .finally(() => {
          this.running = false;
        });
    }, 3000).unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}

@Module({
  controllers: [FittingController],
  providers: [AiProgramFitter, ExerciseFittingService, FittingWorker],
  exports: [ExerciseFittingService],
})
export class FittingModule {}
