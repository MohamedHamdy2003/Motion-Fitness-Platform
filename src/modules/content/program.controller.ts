import { z } from 'zod';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import { ContentGuard } from './content.guard';
import * as dto from './program.dto';
import { ProgramService } from './program.service';
const emptyBody = z.object({}).strict().optional();

@Controller('admin/programs')
@UseGuards(AuthGuard, ContentGuard)
export class ProgramController {
  constructor(@Inject(ProgramService) private programs: ProgramService) {}

  @Get()
  list(@Query() query: unknown) {
    const page = parse(dto.programList, query);
    return this.programs.list(page.limit, page.offset, page.status);
  }

  @Post()
  create(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.programs.create(
      req.principal,
      parse(dto.programAggregate, body),
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.programs.get(parse(uuid, id));
  }

  @Patch(':id')
  update(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.programs.update(
      req.principal,
      parse(uuid, id),
      parse(dto.aggregateEdit, body),
    );
  }

  @Post(':id/publish')
  publish(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    parse(emptyBody, body);
    return this.programs.publish(req.principal, parse(uuid, id));
  }

  @Delete(':id')
  archive(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    parse(emptyBody, body);
    return this.programs.archive(req.principal, parse(uuid, id));
  }

  @Post(':id/hints')
  addHint(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(dto.hintDraft, body);
    return this.programs.addHint(req.principal, parse(uuid, id), input);
  }

  @Post(':id/hints/:hintId/approve')
  approveHint(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Param('hintId') hintId: string,
    @Body() body: unknown,
  ) {
    parse(emptyBody, body);
    return this.programs.approveHint(
      req.principal,
      parse(uuid, id),
      parse(uuid, hintId),
    );
  }
}
