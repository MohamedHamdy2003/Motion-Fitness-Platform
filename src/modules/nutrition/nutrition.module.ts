import { Module } from '@nestjs/common';
import { UserNutritionController } from './nutrition.controller';
import { UserNutritionService } from './nutrition.service';

@Module({
  controllers: [UserNutritionController],
  providers: [UserNutritionService],
  exports: [UserNutritionService],
})
export class UserNutritionModule {}
