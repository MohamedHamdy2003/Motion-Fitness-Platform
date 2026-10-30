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
import { ApiRequest, parse, uuid, empty } from '../../common/http';
import { MediaService } from './media.service';
@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(@Inject(MediaService) private media: MediaService) {}
  @Post('upload-intents') intent(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          size: z.number().int().min(1).max(5242880),
        })
        .strict(),
      body,
    );
    return this.media.intent(req.principal.userId, b.mime, b.size);
  }
  @Post(':id/finalize') finalize(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    parse(empty, b);
    return this.media.finalize(req.principal.userId, parse(uuid, id));
  }
  @Get(':id') get(@Req() req: ApiRequest, @Param('id') id: string) {
    return this.media.get(req.principal.userId, parse(uuid, id));
  }
}
