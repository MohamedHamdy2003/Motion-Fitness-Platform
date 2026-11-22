import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import { ExerciseFittingService } from './fitting.service';

const emptyBody = z.object({}).strict().optional();

@Controller('me/workouts/days')
@UseGuards(AuthGuard)
export class FittingController {
  constructor(
    @Inject(ExerciseFittingService)
    private readonly fitting: ExerciseFittingService,
  ) {}

  @Get(':dayId/fitting')
  async get(
    @Req() req: ApiRequest,
    @Param('dayId') dayId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.fitting.evaluate(
      req.principal.userId,
      parse(uuid, dayId),
    );
    if (result.status === 'PENDING' || result.status === 'RUNNING')
      response.status(202);
    return result;
  }

  @Post(':dayId/fitting/retry')
  async retry(
    @Req() req: ApiRequest,
    @Param('dayId') dayId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    parse(emptyBody, body);
    const result = await this.fitting.evaluate(
      req.principal.userId,
      parse(uuid, dayId),
      true,
    );
    if (result.status === 'PENDING' || result.status === 'RUNNING')
      response.status(202);
    return result;
  }
}
