import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse } from '../../common/http';
import { DashboardService } from './dashboard.service';

const dashboardQuery = z
  .object({
    date: z.iso.date().optional(),
  })
  .strict();

const progressQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();

const checkInListQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const checkInCreateBody = z
  .object({
    workoutDifficulty: z.enum(['EASY', 'MODERATE', 'HARD', 'VERY_HARD']),
    nutritionAdherence: z.enum(['LOW', 'PARTIAL', 'HIGH', 'COMPLETE']),
    weightKg: z.number().gt(0).max(10000),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

@Controller('me')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('dashboard')
  dashboard(@Req() req: ApiRequest, @Query() rawQuery: unknown) {
    const q = parse(dashboardQuery, rawQuery);
    return this.dashboardService.dashboard(req.principal.userId, q.date);
  }

  @Get('progress')
  progress(@Req() req: ApiRequest, @Query() rawQuery: unknown) {
    const q = parse(progressQuery, rawQuery);
    return this.dashboardService.progress(req.principal.userId, q.from, q.to);
  }

  @Get('weight-history')
  weightHistory(@Req() req: ApiRequest, @Query() rawQuery: unknown) {
    const q = parse(progressQuery, rawQuery);
    return this.dashboardService.weightHistory(
      req.principal.userId,
      q.from,
      q.to,
    );
  }

  @Get('check-ins')
  listCheckIns(@Req() req: ApiRequest, @Query() rawQuery: unknown) {
    const q = parse(checkInListQuery, rawQuery);
    return this.dashboardService.listCheckIns(
      req.principal.userId,
      q.limit,
      q.offset,
    );
  }

  @Post('check-ins')
  submitCheckIn(@Req() req: ApiRequest, @Body() body: unknown) {
    const input = parse(checkInCreateBody, body);
    return this.dashboardService.submitCheckIn(req.principal.userId, input);
  }
}
