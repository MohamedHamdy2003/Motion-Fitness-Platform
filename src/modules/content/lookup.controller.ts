import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthGuard } from '../../common/auth.guard';
import { ApiError, parse } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { ContentGuard } from './content.guard';
import { z } from 'zod';

const tableSchema = z.enum([
  'roles',
  'genders',
  'primary-goals',
  'fitness-levels',
  'allergens',
  'body-areas-injuries',
]);
type LookupTable = z.infer<typeof tableSchema>;
const tables: Record<LookupTable, string> = {
  roles: 'roles',
  genders: 'genders',
  'primary-goals': 'primary_goals',
  'fitness-levels': 'fitness_levels',
  allergens: 'allergens',
  'body-areas-injuries': 'body_areas_injuries',
};
const code = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,49}$/);
const label = z.string().trim().min(1).max(100);
const displayOrder = z.number().int().min(0).max(100000);
const parentCode = code.nullable().optional();
const createValue = z
  .object({ code, label, display_order: displayOrder, parent_code: parentCode })
  .strict();
const updateValue = z
  .object({
    label: label.optional(),
    display_order: displayOrder.optional(),
    parent_code: parentCode,
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

@Controller('admin/lookups')
@UseGuards(AuthGuard, ContentGuard)
export class LookupAdminController {
  constructor(@Inject(DataSource) private db: DataSource) {}

  @Post(':table') async create(
    @Param('table') inputTable: string,
    @Body() body: unknown,
  ) {
    const table = parse(tableSchema, inputTable);
    if (table === 'roles')
      throw new ApiError(
        'LOOKUP_VALUE_PROTECTED',
        409,
        'Roles cannot be modified through admin lookup endpoints.',
      );
    const value = parse(createValue, body);
    this.assertParentField(table, value.parent_code);
    if (table === 'body-areas-injuries')
      await this.validateParent(value.parent_code, value.code);
    try {
      const result = await query(
        this.db,
        table === 'body-areas-injuries'
          ? `INSERT INTO ${tables[table]}(code,label,display_order,parent_code) VALUES($1,$2,$3,$4) RETURNING code,label,display_order,parent_code,active`
          : `INSERT INTO ${tables[table]}(code,label,display_order) VALUES($1,$2,$3) RETURNING code,label,display_order,active`,
        table === 'body-areas-injuries'
          ? [
              value.code,
              value.label,
              value.display_order,
              value.parent_code ?? null,
            ]
          : [value.code, value.label, value.display_order],
      );
      return result[0];
    } catch (error) {
      if (this.pgCode(error) === '23505')
        throw new ApiError('LOOKUP_VALUE_EXISTS', 409);
      throw error;
    }
  }

  @Patch(':table/:code') async update(
    @Param('table') inputTable: string,
    @Param('code') inputCode: string,
    @Body() body: unknown,
  ) {
    const table = parse(tableSchema, inputTable);
    if (table === 'roles')
      throw new ApiError(
        'LOOKUP_VALUE_PROTECTED',
        409,
        'Roles cannot be modified through admin lookup endpoints.',
      );
    const key = parse(code, inputCode);
    const value = parse(updateValue, body);
    if (value.active === false)
      throw new ApiError(
        'INVALID_LOOKUP_FIELD',
        400,
        'Use DELETE to deactivate a lookup value.',
      );
    this.assertParentField(table, value.parent_code);
    if (table === 'body-areas-injuries' && value.parent_code !== undefined)
      await this.validateParent(value.parent_code, key);
    const fields: [string, unknown][] = [];
    if (value.label !== undefined) fields.push(['label', value.label]);
    if (value.display_order !== undefined)
      fields.push(['display_order', value.display_order]);
    if (table === 'body-areas-injuries' && value.parent_code !== undefined)
      fields.push(['parent_code', value.parent_code]);
    if (value.active === true) fields.push(['active', true]);
    let result;
    try {
      result = await query(
        this.db,
        `UPDATE ${tables[table]} SET ${fields.map(([name], index) => `${name}=$${index + 2}`).join(',')} WHERE code=$1 RETURNING code,label,display_order${table === 'body-areas-injuries' ? ',parent_code' : ''},active`,
        [key, ...fields.map(([, fieldValue]) => fieldValue)],
      );
    } catch (error) {
      if (this.pgCode(error) === '23505')
        throw new ApiError('LOOKUP_DISPLAY_ORDER_EXISTS', 409);
      throw error;
    }
    if (!result.length) throw new ApiError('NOT_FOUND', 404);
    return result[0];
  }

  @Delete(':table/:code')
  @HttpCode(200)
  async remove(
    @Param('table') inputTable: string,
    @Param('code') inputCode: string,
  ) {
    const table = parse(tableSchema, inputTable);
    if (table === 'roles')
      throw new ApiError(
        'LOOKUP_VALUE_PROTECTED',
        409,
        'Roles cannot be modified through admin lookup endpoints.',
      );
    const key = parse(code, inputCode);
    if (
      [
        'genders',
        'primary-goals',
        'fitness-levels',
        'allergens',
        'body-areas-injuries',
      ].includes(table)
    ) {
      const [count] = await query(
        this.db,
        `SELECT count(*)::integer AS active_count FROM ${tables[table]} WHERE active AND code<>$1`,
        [key],
      );
      if (count.active_count === 0)
        throw new ApiError('LOOKUP_LAST_ACTIVE_VALUE', 409);
    }
    if (table === 'body-areas-injuries') {
      const [child] = await query(
        this.db,
        `SELECT code FROM body_areas_injuries WHERE parent_code=$1 AND active LIMIT 1`,
        [key],
      );
      if (child)
        throw new ApiError(
          'LOOKUP_VALUE_IN_USE',
          409,
          'Move or deactivate this body area’s child areas first.',
        );
    }
    const result = await query(
      this.db,
      `UPDATE ${tables[table]} SET active=false WHERE code=$1 AND active RETURNING code,active`,
      [key],
    );
    if (!result.length) throw new ApiError('NOT_FOUND', 404);
    return { ...result[0], deleted: true };
  }

  private assertParentField(
    table: LookupTable,
    value: string | null | undefined,
  ) {
    if (table !== 'body-areas-injuries' && value !== undefined)
      throw new ApiError(
        'INVALID_LOOKUP_FIELD',
        400,
        'parent_code is only supported for body-areas-injuries.',
      );
  }

  private async validateParent(
    parent: string | null | undefined,
    child: string,
  ) {
    if (parent === child) throw new ApiError('INVALID_LOOKUP_PARENT', 422);
    if (parent) {
      const [row] = await query(
        this.db,
        `SELECT code FROM body_areas_injuries WHERE code=$1 AND active`,
        [parent],
      );
      if (!row) throw new ApiError('INVALID_LOOKUP_PARENT', 422);
      const [cycle] = await query(
        this.db,
        `WITH RECURSIVE descendants(code) AS (SELECT code FROM body_areas_injuries WHERE code=$1 UNION ALL SELECT child.code FROM body_areas_injuries child JOIN descendants parent_row ON child.parent_code=parent_row.code) SELECT EXISTS(SELECT 1 FROM descendants WHERE code=$2) AS invalid`,
        [child, parent],
      );
      if (cycle.invalid) throw new ApiError('INVALID_LOOKUP_PARENT', 422);
    }
  }

  private pgCode(error: unknown) {
    return typeof error === 'object' && error && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  }
}
