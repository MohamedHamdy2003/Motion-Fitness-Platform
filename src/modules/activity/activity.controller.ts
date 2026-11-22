import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import {
  activityGoalsInput,
  dailyActivityQuery,
  dailyStepsInput,
  waterLogInput,
} from './activity.dto';
import { ActivityService } from './activity.service';

@Controller('me/activity')
@UseGuards(AuthGuard)
export class ActivityController {
  constructor(
    @Inject(ActivityService) private readonly activity: ActivityService,
  ) {}

  @Get('daily')
  daily(@Req() req: ApiRequest, @Query() rawQuery: unknown) {
    return this.activity.daily(
      req.principal.userId,
      parse(dailyActivityQuery, rawQuery).date,
    );
  }

  @Post('water')
  addWater(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.activity.addWater(
      req.principal.userId,
      parse(waterLogInput, body).milliliters,
    );
  }

  @Delete('water/:id')
  removeWater(@Req() req: ApiRequest, @Param('id') id: string) {
    return this.activity.removeWater(req.principal.userId, parse(uuid, id));
  }

  @Put('steps')
  setSteps(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.activity.setSteps(
      req.principal.userId,
      parse(dailyStepsInput, body),
    );
  }

  @Put('goals')
  setGoals(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.activity.setGoals(
      req.principal.userId,
      parse(activityGoalsInput, body),
    );
  }
}
