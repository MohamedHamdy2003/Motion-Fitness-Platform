import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import { RateLimit } from '../../common/rate-limit';
import {
  RewriterService,
  rewriteInput,
} from '../../infrastructure/ai/rewriter.service';
import * as dto from './profile.dto';
import { ProfileService } from './profile.service';
@Controller('me')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    @Inject(ProfileService) private profiles: ProfileService,
    @Inject(RewriterService) private rewriter: RewriterService,
    @Inject(RateLimit) private rate: RateLimit,
  ) {}
  @Get() me(@Req() req: ApiRequest) {
    return this.profiles.me(req.principal.userId);
  }
  @Patch() patch(@Req() req: ApiRequest, @Body() b: unknown) {
    return this.profiles.patch(
      req.principal.userId,
      parse(dto.profilePatch, b),
    );
  }
  @Put('onboarding') onboard(
    @Req() req: ApiRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.profiles.onboard(
      req.principal.userId,
      parse(dto.onboarding, b),
      key || '',
    );
  }
  @Get('settings') settings(@Req() req: ApiRequest) {
    return this.profiles.getSettings(req.principal.userId);
  }
  @Patch('settings') setSettings(@Req() req: ApiRequest, @Body() b: unknown) {
    return this.profiles.setSettings(
      req.principal.userId,
      parse(dto.settings, b),
    );
  }
  @Post('measurements') measurement(
    @Req() req: ApiRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.profiles.addMeasurement(
      req.principal.userId,
      parse(dto.measurement, b),
      key || '',
    );
  }
  @Get('measurements') measurements(
    @Req() req: ApiRequest,
    @Query() q: unknown,
  ) {
    return this.profiles.measurements(
      req.principal.userId,
      parse(dto.measurementQuery, q),
    );
  }
  @Get('food-preferences') preferences(@Req() req: ApiRequest) {
    return this.profiles.getPreferences(req.principal.userId);
  }
  @Put('food-preferences') putPreferences(
    @Req() req: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.profiles.putPreferences(
      req.principal.userId,
      parse(dto.preferences, b),
    );
  }
  @Get('injuries') injuries(@Req() req: ApiRequest, @Query() q: unknown) {
    const query = parse(dto.listQuery, q);
    return this.profiles.injuries(
      req.principal.userId,
      query.limit,
      query.offset,
    );
  }
  @Post('injuries') injury(
    @Req() req: ApiRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    return this.profiles.addInjury(
      req.principal.userId,
      parse(dto.injury, b),
      key || '',
    );
  }
  @Patch('injuries/:id') edit(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.profiles.editInjury(
      req.principal.userId,
      parse(uuid, id),
      parse(dto.injuryEdit, b),
    );
  }
  @Delete('injuries/:id') remove(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const input = parse(
      z
        .object({
          expectedVersion: z.number().int().positive(),
          confirmed: z.literal(true),
        })
        .strict(),
      b,
    );
    return this.profiles.removeInjury(
      req.principal.userId,
      parse(uuid, id),
      input.expectedVersion,
    );
  }
  @Post('injuries/rewrite') async rewrite(
    @Req() req: ApiRequest,
    @Body() b: unknown,
  ) {
    const input = parse(rewriteInput, b);
    await this.rate.take('rewrite', req.principal.userId, 10, 60);
    await this.profiles.bodyArea(
      this.profiles.db.manager,
      input.body_area_code,
    );
    return this.rewriter.preview(req.principal.userId, input);
  }
  @Get('matching/status') matching(@Req() req: ApiRequest) {
    return this.profiles.me(req.principal.userId).then((me) => me.matching);
  }
}
