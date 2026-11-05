import { MediaModule } from '../media/media.module';
import { ContentMediaController } from './content-media.controller';
import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ContentGuard } from './content.guard';
import { NutritionLibraryService } from './nutrition-library.service';
import { ProgramController } from './program.controller';
import { ProgramService } from './program.service';
import { LookupAdminController } from './lookup.controller';
@Module({
  imports: [MediaModule],
  controllers: [
    ContentMediaController,
    ProgramController,
    ContentController,
    LookupAdminController,
  ],
  providers: [
    ContentService,
    ContentGuard,
    NutritionLibraryService,
    ProgramService,
  ],
})
export class ContentModule {}
