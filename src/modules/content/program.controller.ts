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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse, uuid } from '../../common/http';
import { ContentGuard } from './content.guard';
import * as dto from './program.dto';
import { ProgramService } from './program.service';

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
  create(
    @Req() req: ApiRequest,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.programs.create(
      req.principal,
      key || '',
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
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.programs.update(
      req.principal,
      parse(uuid, id),
      key || '',
      parse(dto.aggregateEdit, body),
    );
  }

  @Post(':id/publish')
  publish(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.programs.publish(
      req.principal,
      parse(uuid, id),
      key || '',
      parse(dto.expectedVersion, body).expectedVersion,
    );
  }

  @Delete(':id')
  archive(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.programs.archive(
      req.principal,
      parse(uuid, id),
      key || '',
      parse(dto.expectedVersion, body).expectedVersion,
    );
  }

  @Post(':id/hints')
  addHint(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    const input = parse(dto.hintDraft, body);
    return this.programs.addHint(
      req.principal,
      parse(uuid, id),
      key || '',
      input,
    );
  }

  @Post(':id/hints/:hintId/approve')
  approveHint(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Param('hintId') hintId: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.programs.approveHint(
      req.principal,
      parse(uuid, id),
      parse(uuid, hintId),
      key || '',
      parse(dto.hintApproval, body).expectedVersion,
    );
  }
}
