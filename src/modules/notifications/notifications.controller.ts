import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { ApiRequest, parse } from '../../common/http';
import {
  notificationsQuery,
  registerPushTokenInput,
  unregisterPushTokenInput,
  waterReminderInput,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('me')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get('notifications')
  list(@Req() req: ApiRequest, @Query() rawQuery: unknown) {
    return this.notifications.list(
      req.principal.userId,
      parse(notificationsQuery, rawQuery),
    );
  }

  @Put('notifications/:id/read')
  markRead(@Req() req: ApiRequest, @Param('id') id: string) {
    return this.notifications.markRead(
      req.principal.userId,
      parse(z.uuid(), id),
    );
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  markAllRead(@Req() req: ApiRequest) {
    return this.notifications.markAllRead(req.principal.userId);
  }

  @Get('water-reminders')
  getWaterReminders(@Req() req: ApiRequest) {
    return this.notifications.getWaterReminders(req.principal.userId);
  }

  @Put('water-reminders')
  updateWaterReminders(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.notifications.updateWaterReminders(
      req.principal.userId,
      parse(waterReminderInput, body),
    );
  }

  @Put('push-tokens')
  registerPushToken(@Req() req: ApiRequest, @Body() body: unknown) {
    return this.notifications.registerPushToken(
      req.principal.userId,
      parse(registerPushTokenInput, body),
    );
  }

  @Delete('push-tokens')
  unregisterPushToken(@Req() req: ApiRequest, @Body() body: unknown) {
    const parsed = parse(unregisterPushTokenInput, body);
    return this.notifications.unregisterPushToken(
      req.principal.userId,
      parsed.token,
    );
  }
}
