import { query } from '../../infrastructure/database/query';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { parse } from '../../common/http';
import { listQuery } from './profile.dto';
import { minimumAge } from './profile.policy';
@Controller('references')
@UseGuards(AuthGuard)
export class ReferenceController {
  constructor(@Inject(DataSource) private db: DataSource) {}
  @Get('body-areas') async bodyAreas() {
    return {
      items: await query(
        this.db,
        `SELECT code,parent_code FROM body_areas ORDER BY code`,
      ),
    };
  }
  @Get('allergens') async allergens() {
    return {
      items: await query(
        this.db,
        `SELECT code,label FROM allergens ORDER BY code`,
      ),
    };
  }
  @Get('foods') async foods(@Query() input: unknown) {
    const q = parse(
      listQuery.extend({ search: z.string().max(100).default('') }),
      input,
    );
    return {
      items: await query(
        this.db,
        `SELECT id,name,kind FROM food_reference_items WHERE name ILIKE $1 ORDER BY name,id LIMIT $2 OFFSET $3`,
        ['%' + q.search + '%', q.limit, q.offset],
      ),
      limit: q.limit,
      offset: q.offset,
      contentStatus: 'CATALOG_NOT_SEEDED',
    };
  }
  @Get('onboarding') options() {
    return {
      primary_goals: ['FAT_LOSS', 'STRENGTH_HYPERTROPHY'],
      fitness_levels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
      training_days_per_week: [2, 3, 4, 5],
      minimum_age: minimumAge,
      minimum_age_inclusive: false,
      measurement_max_age_days: null,
      policyStatus: 'CONFIGURED',
    };
  }
}
