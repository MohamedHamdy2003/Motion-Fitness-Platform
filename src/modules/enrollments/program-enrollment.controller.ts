import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import { ProgramEnrollmentService } from './program-enrollment.service';

const acceptChangeInput = z
  .object({
    recommendationRunId: uuid,
  })
  .strict();

@Controller('me')
@UseGuards(AuthGuard)
export class ProgramEnrollmentController {
  constructor(
    @Inject(ProgramEnrollmentService)
    private readonly enrollment: ProgramEnrollmentService,
  ) {}

  @Get('program')
  current(@Req() req: ApiRequest) {
    return this.enrollment.current(req.principal.userId);
  }

  @Post('program/change/accept')
  acceptChange(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.enrollment.acceptProgramChange(
      req.principal.userId,
      parse(acceptChangeInput, body).recommendationRunId,
    );
  }

  @Get('program/months')
  months(@Req() req: ApiRequest) {
    return this.enrollment.months(req.principal.userId);
  }

  @Get('program/months/:monthId/weeks')
  weeks(@Req() req: ApiRequest, @Param('monthId') monthId: string) {
    return this.enrollment.weeks(req.principal.userId, parse(uuid, monthId));
  }

  @Get('program/weeks/:weekId/days')
  weekDays(@Req() req: ApiRequest, @Param('weekId') weekId: string) {
    return this.enrollment.weekDays(req.principal.userId, parse(uuid, weekId));
  }

  @Get('days/:date')
  day(@Req() req: ApiRequest, @Param('date') date: string) {
    return this.enrollment.day(req.principal.userId, parse(z.iso.date(), date));
  }
}
