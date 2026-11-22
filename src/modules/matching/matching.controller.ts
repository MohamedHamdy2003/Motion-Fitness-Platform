import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { ContentGuard } from '../content/content.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import { RateLimit } from '../../common/rate-limit';
import { listQuery } from '../profiles/profile.dto';
import { z } from 'zod';
import {
  matchingProfile,
  publication,
  rulesetInput,
} from './matching.contract';
import { ProgramMatchingService } from './program-matching.service';
@Controller('me/matching')
@UseGuards(AuthGuard)
export class MatchingController {
  constructor(
    @Inject(ProgramMatchingService) private matching: ProgramMatchingService,
    @Inject(RateLimit) private rate: RateLimit,
  ) {}
  @Get('status') status(@Req() req: ApiRequest) {
    return this.matching.status(req.principal.userId);
  }
  @Post('retry') async retry(@Req() req: ApiRequest, @Body() body: unknown) {
    parse(z.object({}).strict().optional(), body);
    await this.rate.take('matching-retry', req.principal.userId, 3, 900);
    return this.matching.triggerUser(req.principal.userId, true);
  }
}
@Controller('admin/matching')
@UseGuards(AuthGuard, ContentGuard)
export class AdminMatchingController {
  constructor(
    @Inject(ProgramMatchingService) private matching: ProgramMatchingService,
    @Inject(RateLimit) private rate: RateLimit,
  ) {}
  @Post('rulesets') create(@Body() body: unknown) {
    return this.matching.createRuleset(parse(rulesetInput, body));
  }
  @Get('rulesets') list(@Query() input: unknown) {
    const q = parse(listQuery, input);
    return this.matching.listRulesets(q.limit, q.offset);
  }
  @Post('rulesets/:id/publish') publish(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.matching.publish(parse(uuid, id), parse(publication, body));
  }
  @Post('rulesets/:id/simulate') async simulate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    await this.rate.take('matching-simulate', req.principal.userId, 10, 900);
    return this.matching.simulate(
      parse(uuid, id),
      parse(matchingProfile, body),
    );
  }
  @Get('runs/:id') run(@Param('id') id: string) {
    return this.matching.adminRun(parse(uuid, id));
  }
}
