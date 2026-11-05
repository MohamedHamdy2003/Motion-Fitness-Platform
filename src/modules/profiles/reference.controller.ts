import { query } from '../../infrastructure/database/query';
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { ApiError, parse, uuid } from '../../common/http';
import { listQuery, TrainingWeekday } from './profile.dto';
import { minimumAge } from './profile.policy';
@Controller('references')
export class ReferenceController {
  constructor(@Inject(DataSource) private db: DataSource) {}
  @Get('body-areas') async bodyAreas() {
    return {
      items: await query(
        this.db,
        `SELECT code,label,parent_code,display_order FROM body_areas_injuries WHERE active ORDER BY display_order,code`,
      ),
    };
  }
  @Get('allergens') async allergens() {
    return {
      items: await query(
        this.db,
        `SELECT code,label,display_order FROM allergens WHERE active ORDER BY display_order,code`,
      ),
    };
  }
  @Get('roles') async roles() {
    return {
      items: await query(
        this.db,
        `SELECT code,label,display_order FROM roles WHERE active ORDER BY display_order,code`,
      ),
    };
  }
  @Get('genders') async genders() {
    return {
      items: await query(
        this.db,
        `SELECT code,label,display_order FROM genders WHERE active ORDER BY display_order,code`,
      ),
    };
  }
  @Get('primary-goals') async primaryGoals() {
    return {
      items: await query(
        this.db,
        `SELECT code,label,display_order FROM primary_goals WHERE active ORDER BY display_order,code`,
      ),
    };
  }
  @Get('fitness-levels') async fitnessLevels() {
    return {
      items: await query(
        this.db,
        `SELECT code,label,display_order FROM fitness_levels WHERE active ORDER BY display_order,code`,
      ),
    };
  }
  @Get('foods') async foods(@Query() input: unknown) {
    const q = parse(
      listQuery.extend({ search: z.string().max(100).default('') }),
      input,
    );
    const [items, status] = await Promise.all([
      query(
        this.db,
        `SELECT id,name,kind FROM available_food_references WHERE name ILIKE $1 ORDER BY name,id LIMIT $2 OFFSET $3`,
        ['%' + q.search + '%', q.limit, q.offset],
      ),
      query(
        this.db,
        `SELECT EXISTS(SELECT 1 FROM foods f JOIN food_versions v ON v.food_id=f.id WHERE NOT f.archived AND v.status='PUBLISHED') AS seeded`,
      ),
    ]);
    return {
      items,
      limit: q.limit,
      offset: q.offset,
      contentStatus: status[0].seeded ? 'READY' : 'CATALOG_NOT_SEEDED',
    };
  }
  @Get('ingredients') async ingredients(@Query() input: unknown) {
    const q = parse(
      listQuery.extend({ search: z.string().max(100).default('') }),
      input,
    );
    const [items, count] = await Promise.all([
      query(
        this.db,
        `SELECT i.id,i.slug,i.title,i.dietary_tags,i.verification_status,i.metadata_version,ARRAY(SELECT allergen_code FROM ingredient_allergens WHERE ingredient_id=i.id ORDER BY allergen_code) AS allergen_codes FROM ingredients i WHERE NOT i.archived AND i.title ILIKE $1 ORDER BY i.title,i.id LIMIT $2 OFFSET $3`,
        [`%${q.search}%`, q.limit, q.offset],
      ),
      query(
        this.db,
        `SELECT count(*)::integer AS total FROM ingredients i WHERE NOT i.archived AND i.title ILIKE $1`,
        [`%${q.search}%`],
      ),
    ]);
    return { items, total: count[0].total, limit: q.limit, offset: q.offset };
  }
  @Get('ingredients/:id') async ingredient(@Param('id') input: string) {
    const id = parse(uuid, input);
    const [item] = await query(
      this.db,
      `SELECT i.id,i.slug,i.title,i.dietary_tags,i.verification_status,i.metadata_version,ARRAY(SELECT allergen_code FROM ingredient_allergens WHERE ingredient_id=i.id ORDER BY allergen_code) AS allergen_codes FROM ingredients i WHERE i.id=$1 AND NOT i.archived`,
      [id],
    );
    if (!item) throw new ApiError('NOT_FOUND', 404);
    return { item };
  }
  @Get('meal-sections') async mealSections() {
    return {
      items: await query(
        this.db,
        `SELECT s.id,s.slug,s.title FROM meal_sections s WHERE NOT s.archived AND EXISTS(SELECT 1 FROM meal_versions v JOIN meals m ON m.id=v.meal_id WHERE v.section_id=s.id AND v.status='PUBLISHED' AND v.availability_status='AVAILABLE' AND NOT m.archived) ORDER BY s.slug`,
      ),
    };
  }
  @Get('meals') async meals(@Query() input: unknown) {
    const q = parse(listQuery, input);
    const items = await query(
      this.db,
      `SELECT m.id,m.slug,v.id AS version_id,v.version,v.section_id,s.slug AS section_slug,v.title FROM meals m JOIN LATERAL(SELECT * FROM meal_versions WHERE meal_id=m.id AND status='PUBLISHED' AND availability_status='AVAILABLE' ORDER BY version DESC LIMIT 1) v ON true JOIN meal_sections s ON s.id=v.section_id WHERE NOT m.archived AND NOT s.archived ORDER BY v.title,m.slug LIMIT $1 OFFSET $2`,
      [q.limit, q.offset],
    );
    return { items, limit: q.limit, offset: q.offset };
  }
  @Get('meals/:id') async meal(@Param('id') input: string) {
    const id = parse(uuid, input);
    const [meal] = await query(
      this.db,
      `SELECT m.id,m.slug,v.id AS version_id,v.version,v.section_id,s.slug AS section_slug,v.title FROM meals m JOIN LATERAL(SELECT * FROM meal_versions WHERE meal_id=m.id AND status='PUBLISHED' AND availability_status='AVAILABLE' ORDER BY version DESC LIMIT 1) v ON true JOIN meal_sections s ON s.id=v.section_id WHERE m.id=$1 AND NOT m.archived AND NOT s.archived`,
      [id],
    );
    if (!meal) throw new ApiError('NOT_FOUND', 404);
    const items = await query(
      this.db,
      `SELECT i.position,i.exchange_units,member.id AS member_id,member.group_version_id,member.food_version_id,member.portion_g_per_unit,member.display_portion,f.content->>'title' AS food_title FROM meal_items i JOIN food_exchange_members member ON member.id=i.default_exchange_member_id JOIN food_exchange_group_versions group_version ON group_version.id=member.group_version_id AND group_version.status='PUBLISHED' JOIN food_exchange_groups group_identity ON group_identity.id=group_version.group_id AND NOT group_identity.archived JOIN food_versions f ON f.id=member.food_version_id AND f.status='PUBLISHED' JOIN foods food ON food.id=f.food_id AND NOT food.archived WHERE i.meal_version_id=$1 ORDER BY i.position`,
      [meal.version_id],
    );
    return { item: { ...meal, items } };
  }
  @Get('onboarding') async options() {
    return {
      primary_goals: await query(
        this.db,
        `SELECT code,label FROM primary_goals WHERE active ORDER BY display_order,code`,
      ),
      genders: (
        await query(
          this.db,
          `SELECT code FROM genders WHERE active ORDER BY display_order,code`,
        )
      ).map((row: { code: string }) => row.code),
      fitness_levels: await query(
        this.db,
        `SELECT code,label FROM fitness_levels WHERE active ORDER BY display_order,code`,
      ),
      training_days_per_week: Object.values(TrainingWeekday),
      training_days_per_week_count: [2, 3, 4, 5],
      minimum_age: minimumAge,
      minimum_age_inclusive: false,
      policyStatus: 'CONFIGURED',
    };
  }
}
