import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { parse, uuid } from '../../common/http';
import { ContentGuard } from '../content/content.guard';
import { AdminUsersService } from './admin-users.service';

const listUsersQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETION_PENDING']).optional(),
  })
  .strict();

const updateStatusBody = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
  })
  .strict();

@Controller('admin/users')
@UseGuards(AuthGuard, ContentGuard)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService)
    private readonly users: AdminUsersService,
  ) {}

  @Get()
  list(@Query() rawQuery: unknown) {
    const q = parse(listUsersQuery, rawQuery);
    return this.users.listTrainees(q);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() rawBody: unknown) {
    const body = parse(updateStatusBody, rawBody);
    return this.users.updateStatus(parse(uuid, id), body.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.deleteTrainee(parse(uuid, id));
  }
}
