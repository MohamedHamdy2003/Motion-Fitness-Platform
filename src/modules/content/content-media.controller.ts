import { page } from './content.dto';
import {
  Body,
  Controller,
  Get,
  Query,
  Delete,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { DataSource } from 'typeorm';
import { AuthGuard } from '../../common/auth.guard';
import { ApiError, ApiRequest, empty, parse, uuid } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { MediaService } from '../media/media.service';
import { ContentGuard } from './content.guard';
@Controller('admin/media')
@UseGuards(AuthGuard, ContentGuard)
export class ContentMediaController {
  constructor(
    @Inject(MediaService) private media: MediaService,
    @Inject(DataSource) private db: DataSource,
  ) {}
  @Post('upload-intents') async intent(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
          size: z.number().int().min(1).max(104857600),
        })
        .strict(),
      body,
    );
    const result = await this.media.intent(
      req.principal.userId,
      b.mime,
      b.size,
      true,
    );
    return result;
  }
  @Post(':id/finalize') async finalize(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    parse(empty, body);
    id = parse(uuid, id);
    const [asset] = await query(
      this.db,
      `SELECT * FROM media_assets WHERE id=$1 AND library_asset=true AND NOT library_archived`,
      [id],
    );
    if (!asset) throw new ApiError('NOT_FOUND', 404);
    if (asset.status === 'READY' && asset.owner_user_id === null)
      return { id, status: 'READY' };
    const result = await this.media.finalize(req.principal.userId, id, true);
    return result;
  }
  @Get() async list(@Req() req: ApiRequest, @Query() input: unknown) {
    const p = parse(page, input);
    return query(
      this.db,
      `SELECT id,mime,size,status,library_archived,created_at FROM media_assets WHERE library_asset AND (owner_user_id IS NULL OR owner_user_id=$1) ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
      [req.principal.userId, p.limit, p.offset],
    );
  }
  @Get(':id') async get(@Req() req: ApiRequest, @Param('id') id: string) {
    id = parse(uuid, id);
    const [asset] = await query(
      this.db,
      `SELECT id,mime,size,status FROM media_assets WHERE id=$1 AND library_asset AND NOT library_archived AND owner_user_id=$2`,
      [id, req.principal.userId],
    );
    if (asset) return asset;
    return this.media.get(null, id);
  }

  @Delete(':id') async archive(@Param('id') id: string, @Body() body: unknown) {
    parse(empty, body);
    id = parse(uuid, id);
    return this.db.transaction(async (m) => {
      const [asset] = await query(
        m,
        `SELECT id FROM media_assets WHERE id=$1 AND library_asset AND owner_user_id IS NULL FOR UPDATE`,
        [id],
      );
      if (!asset) throw new ApiError('NOT_FOUND', 404);
      const refs = await query(
        m,
        `SELECT id FROM exercise_revisions WHERE media_id=$1 UNION ALL SELECT id FROM food_versions WHERE media_id=$1`,
        [id],
      );
      if (refs.length) throw new ApiError('MEDIA_IN_USE', 409);
      await query(
        m,
        `UPDATE media_assets SET library_archived=true WHERE id=$1`,
        [id],
      );
      return { id, archived: true };
    });
  }
}
