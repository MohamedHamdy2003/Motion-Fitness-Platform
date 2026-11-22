import { Module } from '@nestjs/common';
import { ContentGuard } from '../content/content.guard';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, ContentGuard],
  exports: [SupportService],
})
export class SupportModule {}
