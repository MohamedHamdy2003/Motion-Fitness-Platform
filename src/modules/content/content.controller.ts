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
import { NutritionLibraryService } from './nutrition-library.service';
import * as dto from './content.dto';
const kindSchema = z.enum(['exercises', 'foods']);
@Controller('admin')
@UseGuards(AuthGuard, ContentGuard)
export class ContentController {
  constructor(
    @Inject(ContentService) private content: ContentService,
    @Inject(NutritionLibraryService) private nutrition: NutritionLibraryService,
  ) {}
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
  @Get('food-sections') foodSections(@Query() q: unknown) {
    const p = parse(dto.page, q);
    return this.nutrition.listFoodSections(p.limit, p.offset);
  }
  @Post('food-sections') foodSection(@Body() body: unknown) {
    const b = parse(dto.foodSection, body);
    return this.nutrition.createFoodSection(b.slug, b.title, b.members);
  }
  @Patch('food-sections/:id') updateFoodSection(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(dto.foodSectionUpdate, body);
    return this.nutrition.reviseFoodSection(
      parse(uuid, id),
      b.expectedRevision,
      b.title,
      b.members,
    );
  }
  @Get('food-sections/:id') getFoodSection(@Param('id') id: string) {
    return this.nutrition.getFoodSection(parse(uuid, id));
  }
  @Post('food-sections/:id/publish') publishFoodSection(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.publishFoodSection(
      parse(uuid, id),
      parse(dto.expected, body).expectedRevision,
    );
  }
  @Delete('food-sections/:id') archiveFoodSection(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.archiveFoodSection(
      parse(uuid, id),
      parse(dto.expected, body).expectedRevision,
    );
  }
  @Get('meal-sections') mealSections(@Query() q: unknown) {
    const p = parse(dto.page, q);
    return this.nutrition.listMealSections(p.limit, p.offset);
  }
  @Post('meal-sections') mealSection(@Body() body: unknown) {
    const b = parse(dto.mealSection, body);
    return this.nutrition.createMealSection(b.slug, b.title);
  }
  @Get('meal-sections/:id') getMealSection(@Param('id') id: string) {
    return this.nutrition.getMealSection(parse(uuid, id));
  }
  @Patch('meal-sections/:id') updateMealSection(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(dto.mealSection, body);
    return this.nutrition.reviseMealSection(parse(uuid, id), b.slug, b.title);
  }
  @Delete('meal-sections/:id') archiveMealSection(@Param('id') id: string) {
    return this.nutrition.archiveMealSection(parse(uuid, id));
  }
  @Get('meals') meals(@Query() q: unknown) {
    const p = parse(dto.page, q);
    return this.nutrition.listMeals(p.limit, p.offset);
  }
  @Post('meals') meal(@Body() body: unknown) {
    const b = parse(dto.meal, body);
    return this.nutrition.createMeal(b.slug, b.sectionId, b.title, b.items);
  }
  @Patch('meals/:id') updateMeal(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(dto.mealUpdate, body);
    return this.nutrition.reviseMeal(
      parse(uuid, id),
      b.expectedRevision,
      b.sectionId,
      b.title,
      b.items,
    );
  }
  @Get('meals/:id/items') mealItems(@Param('id') id: string) {
    return this.nutrition.listCurrentMealItems(parse(uuid, id));
  }
  @Get('meals/:id/items/:position') mealItem(
    @Param('id') id: string,
    @Param('position') position: string,
  ) {
    return this.nutrition.getCurrentMealItem(
      parse(uuid, id),
      parse(dto.mealItemPosition, position),
    );
  }
  @Post('meals/:id/items') addMealItem(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          expectedRevision: z.number().int().positive(),
          item: dto.mealItem,
        })
        .strict(),
      body,
    );
    return this.nutrition.addMealItem(
      parse(uuid, id),
      b.expectedRevision,
      b.item,
    );
  }
  @Patch('meals/:id/items/:position') updateMealItem(
    @Param('id') id: string,
    @Param('position') position: string,
    @Body() body: unknown,
  ) {
    const b = parse(dto.mealItemUpdate, body);
    return this.nutrition.updateMealItem(
      parse(uuid, id),
      parse(dto.mealItemPosition, position),
      b.expectedRevision,
      b,
    );
  }
  @Delete('meals/:id/items/:position') deleteMealItem(
    @Param('id') id: string,
    @Param('position') position: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.deleteMealItem(
      parse(uuid, id),
      parse(dto.mealItemPosition, position),
      parse(dto.expected, body).expectedRevision,
    );
  }
  @Get('meals/:id') getMeal(@Param('id') id: string) {
    return this.nutrition.getMeal(parse(uuid, id));
  }
  @Post('meals/:id/publish') publishMeal(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.publishMeal(
      parse(uuid, id),
      parse(dto.expected, body).expectedRevision,
    );
  }
  @Delete('meals/:id') archiveMeal(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.nutrition.archiveMeal(
      parse(uuid, id),
      parse(dto.expected, body).expectedRevision,
    );
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
