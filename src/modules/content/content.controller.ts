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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { parse, uuid } from '../../common/http';
import { ContentGuard } from './content.guard';
import { ContentService } from './content.service';
import * as dto from './content.dto';
const kindSchema = z.enum(['exercises', 'foods']);
@Controller('admin')
@UseGuards(AuthGuard, ContentGuard)
export class ContentController {
  constructor(@Inject(ContentService) private content: ContentService) {}
  @Get('ingredients') ingredients(@Query() q: unknown) {
    const p = parse(dto.page, q);
    return this.content.ingredientList(p.limit, p.offset);
  }
  @Post('ingredients') ingredient(@Body() body: unknown) {
    const b = parse(
      z.object({ slug: dto.slug, content: dto.ingredient }).strict(),
      body,
    );
    return this.content.saveIngredient(b.content, b.slug);
  }
  @Patch('ingredients/:id') updateIngredient(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          expectedRevision: z.number().int().positive(),
          content: dto.ingredient,
        })
        .strict(),
      body,
    );
    return this.content.saveIngredient(
      b.content,
      undefined,
      parse(uuid, id),
      b.expectedRevision,
    );
  }
  @Get('ingredients/:id') getIngredient(@Param('id') id: string) {
    return this.content.getIngredient(parse(uuid, id));
  }
  @Delete('ingredients/:id') archiveIngredient(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.content.archiveIngredient(
      parse(uuid, id),
      parse(dto.expected, body).expectedRevision,
    );
  }
  @Get(':kind') list(@Param('kind') kind: string, @Query() q: unknown) {
    const p = parse(dto.page, q);
    return this.content.list(parse(kindSchema, kind), p.limit, p.offset);
  }
  @Get(':kind/:id') get(@Param('kind') kind: string, @Param('id') id: string) {
    return this.content.get(parse(kindSchema, kind), parse(uuid, id));
  }
  @Post(':kind') create(@Param('kind') kind: string, @Body() body: unknown) {
    const k = parse(kindSchema, kind);
    const b = parse(
      z
        .object({
          slug: dto.slug,
          content: k === 'exercises' ? dto.exercise : dto.food,
        })
        .strict(),
      body,
    );
    return this.content.create(k, b.slug, b.content);
  }
  @Patch(':kind/:id') update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const k = parse(kindSchema, kind);
    const b = parse(
      z
        .object({
          expectedRevision: z.number().int().positive(),
          content: k === 'exercises' ? dto.exercise : dto.food,
        })
        .strict(),
      body,
    );
    return this.content.revise(
      k,
      parse(uuid, id),
      b.expectedRevision,
      b.content,
    );
  }
  @Post(':kind/:id/publish') publish(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(dto.expected, body);
    return this.content.revise(
      parse(kindSchema, kind),
      parse(uuid, id),
      b.expectedRevision,
      undefined,
      true,
    );
  }
  @Delete(':kind/:id') archive(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(dto.expected, body);
    return this.content.archive(
      parse(kindSchema, kind),
      parse(uuid, id),
      b.expectedRevision,
    );
  }
}
