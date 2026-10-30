import { query } from '../../infrastructure/database/query';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AuthGuard } from '../../common/auth.guard';
import { parse } from '../../common/http';
import { listQuery } from './profile.dto';
import { environment } from '../../config/environment';
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
    const e = environment();
    return {
      primary_goals: ['FAT_LOSS', 'STRENGTH_HYPERTROPHY'],
      fitness_levels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
      training_days_per_week: [2, 3, 4, 5],
      body_fat_methods: e.BODY_FAT_METHODS.split(',')
        .map((v) => v.trim())
        .filter(Boolean),
      minimum_age: e.MINIMUM_AGE ? Number(e.MINIMUM_AGE) : null,
      measurement_max_age_days: e.MEASUREMENT_MAX_AGE_DAYS
        ? Number(e.MEASUREMENT_MAX_AGE_DAYS)
        : null,
      policyStatus:
        e.MINIMUM_AGE && e.MEASUREMENT_MAX_AGE_DAYS
          ? 'CONFIGURED'
          : 'PENDING_APPROVAL',
    };
  }
}
