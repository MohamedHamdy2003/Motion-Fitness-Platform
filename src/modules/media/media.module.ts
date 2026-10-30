import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaSchema } from './media.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
@Module({
  imports: [TypeOrmModule.forFeature([MediaSchema])],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
