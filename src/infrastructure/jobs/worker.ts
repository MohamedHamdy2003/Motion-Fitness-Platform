import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { JobsService } from './jobs.service';
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  app.enableShutdownHooks();
  const jobs = app.get(JobsService);
  await jobs.cleanup();
  await jobs.tick();
}
void main().catch(() => {
  process.stderr.write('Worker startup failed\n');
  process.exitCode = 1;
});
