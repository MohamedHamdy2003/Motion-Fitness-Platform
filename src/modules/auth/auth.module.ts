import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSchema } from './user.entity';
import { AuthService } from './auth.service';
import { SocialService } from './social.service';
import { AuthController, AccountDeletionController } from './auth.controller';
import { MailService } from '../../infrastructure/mail/mail.service';
@Module({
  imports: [TypeOrmModule.forFeature([UserSchema])],
  controllers: [AuthController, AccountDeletionController],
  providers: [AuthService, SocialService, MailService],
  exports: [AuthService, SocialService],
})
export class AuthModule {}
