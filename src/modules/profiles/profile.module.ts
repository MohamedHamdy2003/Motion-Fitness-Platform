import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileSchema, InjurySchema } from './profile.entity';
import { ProfileController } from './profile.controller';
import { ReferenceController } from './reference.controller';
import { ProfileService } from './profile.service';
import { RewriterService } from '../../infrastructure/ai/rewriter.service';
@Module({
  imports: [TypeOrmModule.forFeature([ProfileSchema, InjurySchema])],
  controllers: [ProfileController, ReferenceController],
  providers: [ProfileService, RewriterService],
})
export class ProfileModule {}
