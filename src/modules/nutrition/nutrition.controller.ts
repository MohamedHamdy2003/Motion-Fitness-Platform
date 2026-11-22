import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import {
  completionInput,
  mealItemSubstitutionInput,
  mealSubstitutionInput,
} from './nutrition.dto';
import { UserNutritionService } from './nutrition.service';

@Controller('me')
@UseGuards(AuthGuard)
export class UserNutritionController {
  constructor(
    @Inject(UserNutritionService)
    private readonly nutrition: UserNutritionService,
  ) {}

  @Get('nutrition/assignment')
  assignment(@Req() req: ApiRequest) {
    return this.nutrition.assignment(req.principal.userId);
  }

  @Get('nutrition/days/:date')
  day(@Req() req: ApiRequest, @Param('date') date: string) {
    return this.nutrition.day(req.principal.userId, parse(z.iso.date(), date));
  }

  @Get('meals/:mealId')
  getMeal(@Req() req: ApiRequest, @Param('mealId') mealId: string) {
    return this.nutrition.getMeal(req.principal.userId, parse(uuid, mealId));
  }

  @Put('meals/:mealId/completion')
  completeMeal(
    @Req() req: ApiRequest,
    @Param('mealId') mealId: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.setMealCompletion(
      req.principal.userId,
      parse(uuid, mealId),
      parse(completionInput, body).completed,
    );
  }

  @Get('meals/:mealId/alternatives')
  mealAlternatives(@Req() req: ApiRequest, @Param('mealId') mealId: string) {
    return this.nutrition.listMealAlternatives(
      req.principal.userId,
      parse(uuid, mealId),
    );
  }

  @Post('meals/:mealId/substitutions')
  substituteMeal(
    @Req() req: ApiRequest,
    @Param('mealId') mealId: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.substituteMeal(
      req.principal.userId,
      parse(uuid, mealId),
      parse(mealSubstitutionInput, body).selectedMealVersionId,
    );
  }

  @Put('meal-items/:itemId/completion')
  completeMealItem(
    @Req() req: ApiRequest,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.setMealItemCompletion(
      req.principal.userId,
      parse(uuid, itemId),
      parse(completionInput, body).completed,
    );
  }

  @Get('meal-items/:itemId/alternatives')
  mealItemAlternatives(
    @Req() req: ApiRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.nutrition.listMealItemAlternatives(
      req.principal.userId,
      parse(uuid, itemId),
    );
  }

  @Post('meal-items/:itemId/substitutions')
  substituteMealItem(
    @Req() req: ApiRequest,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.substituteMealItem(
      req.principal.userId,
      parse(uuid, itemId),
      parse(mealItemSubstitutionInput, body).selectedMemberId,
    );
  }
}
