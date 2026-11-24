import { foodDisplay } from './food-display';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { z } from 'zod';
import * as dto from './content.dto';
export type Kind = 'exercises' | 'foods';
const tables = {
  exercises: ['exercises', 'exercise_revisions', 'exercise_id'],
  foods: ['foods', 'food_versions', 'food_id'],
} as const;
@Injectable()
export class ContentService {
  constructor(@Inject(DataSource) private db: DataSource) {}
  async list(
    kind: Kind,
    limit: number,
    offset: number,
    filters: {
      search?: string;
      status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      includeArchived?: boolean;
      ids?: string[];
    } = {},
  ) {
    const [itemsTable, versions, fk] = tables[kind];
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.ids?.length) {
      params.push(filters.ids);
      conditions.push(
        `(v.id = ANY($${params.length}::uuid[]) OR i.id = ANY($${params.length}::uuid[]))`,
      );
    }
    if (filters.status === 'ARCHIVED') {
      conditions.push('i.archived');
    } else if (filters.status === 'DRAFT' || filters.status === 'PUBLISHED') {
      params.push(filters.status);
      conditions.push(`NOT i.archived AND v.status = $${params.length}`);
    } else if (filters.includeArchived === false) {
      conditions.push('NOT i.archived');
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(coalesce(v.content->>'title', '') ILIKE $${params.length} OR i.slug ILIKE $${params.length})`,
      );
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const baseFrom = `FROM ${itemsTable} i JOIN LATERAL (SELECT * FROM ${versions} WHERE ${fk}=i.id ORDER BY version DESC LIMIT 1) v ON true ${whereClause}`;
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [rows, countRows] = await Promise.all([
      query(
        this.db,
        `SELECT i.*,v.id AS version_id,v.version,v.revision,v.status,v.content ${baseFrom} ORDER BY i.slug LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset],
      ),
      query(this.db, `SELECT count(*)::integer AS total ${baseFrom}`, params),
    ]);

    return {
      items: rows,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    };
  }
  async get(kind: Kind, id: string) {
    const [items, versions, fk] = tables[kind];
    const [item] = await query(this.db, `SELECT * FROM ${items} WHERE id=$1`, [
      id,
    ]);
    if (!item) throw new ApiError('NOT_FOUND', 404);
    return {
      ...item,
      versions: await query(
        this.db,
        `SELECT * FROM ${versions} WHERE ${fk}=$1 ORDER BY version DESC`,
        [id],
      ),
    };
  }
  async create(kind: Kind, slug: string, content: Record<string, unknown>) {
    return this.db.transaction(async (m) => {
      const id = randomUUID();
      if (kind === 'foods')
        await query(
          m,
          `INSERT INTO food_reference_items(id,name,kind,description) VALUES($1,$2,'FOOD',$3)`,
          [
            id,
            ...Object.values(
              foodDisplay(
                content.title as string,
                content.description as string | undefined,
              ),
            ),
          ],
        );
      await query(m, `INSERT INTO ${tables[kind][0]}(id,slug) VALUES($1,$2)`, [
        id,
        slug,
      ]);
      return this.insertVersion(m, kind, id, 1, content);
    });
  }
  async insertVersion(
    m: EntityManager,
    kind: Kind,
    itemId: string,
    version: number,
    content: Record<string, unknown>,
  ) {
    await this.validateReferences(m, content, kind);
    const [, versions, fk] = tables[kind];
    const id = randomUUID();
    const [row] = await query(
      m,
      `INSERT INTO ${versions}(id,${fk},version,content,media_id) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [id, itemId, version, content, content.mediaId],
    );
    await this.ingredients(m, kind, id, content);
    return row;
  }
  async validateReferences(
    m: EntityManager,
    content: Record<string, unknown>,
    kind: Kind,
  ) {
    if (content.mediaId) {
      const [media] = await query(
        m,
        `SELECT id FROM media_assets WHERE id=$1 AND status='READY' AND owner_user_id IS NULL AND library_asset AND NOT library_archived FOR SHARE`,
        [content.mediaId],
      );
      if (!media) throw new ApiError('CONTENT_MEDIA_NOT_READY', 422);
    }
    if (kind === 'foods') {
      const ingredientIds = [
        ...new Set(
          (content as z.infer<typeof dto.food>).ingredients.map(
            (ingredient) => ingredient.ingredientId,
          ),
        ),
      ];
      if (ingredientIds.length) {
        const rows = await query(
          m,
          `SELECT id FROM ingredients WHERE id = ANY($1::uuid[]) AND NOT archived FOR SHARE`,
          [ingredientIds],
        );
        if (rows.length !== ingredientIds.length) {
          throw new ApiError('INGREDIENT_UNAVAILABLE', 422);
        }
      }
    }
  }
  async ingredients(
    m: EntityManager,
    kind: Kind,
    id: string,
    content: Record<string, unknown>,
  ) {
    if (kind !== 'foods') return;
    await query(m, `DELETE FROM food_ingredients WHERE food_version_id=$1`, [
      id,
    ]);
    const list = (content as z.infer<typeof dto.food>).ingredients;
    if (list.length) {
      await query(
        m,
        `INSERT INTO food_ingredients(food_version_id, ingredient_id, quantity_g)
         SELECT $1, ing_id, qty
         FROM unnest($2::uuid[], $3::numeric[]) AS t(ing_id, qty)`,
        [id, list.map((i) => i.ingredientId), list.map((i) => i.quantityG)],
      );
    }
  }
  async revise(
    kind: Kind,
    id: string,
    content?: Record<string, unknown>,
    publish = false,
  ) {
    return this.db.transaction(async (m) => {
      const [items, versions, fk] = tables[kind];
      const [item] = await query(
        m,
        `SELECT * FROM ${items} WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!item) throw new ApiError('NOT_FOUND', 404);
      if (item.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      const [v] = await query(
        m,
        `SELECT * FROM ${versions} WHERE ${fk}=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      if (publish) {
        if (v.status !== 'DRAFT') throw new ApiError('ALREADY_PUBLISHED', 409);
        await this.validateReferences(m, v.content, kind);
        if (kind === 'foods')
          await query(
            m,
            `UPDATE food_reference_items SET name=$2,description=$3 WHERE id=$1`,
            [
              id,
              ...Object.values(
                foodDisplay(v.content.title, v.content.description),
              ),
            ],
          );
        return (
          await query(
            m,
            `UPDATE ${versions} SET status='PUBLISHED',revision=revision+1 WHERE id=$1 RETURNING *`,
            [v.id],
          )
        )[0];
      }
      if (v.status === 'PUBLISHED') {
        const result = await this.insertVersion(
          m,
          kind,
          id,
          v.version + 1,
          content!,
        );
        await query(m, `UPDATE ${versions} SET revision=$2 WHERE id=$1`, [
          result.id,
          v.revision + 1,
        ]);
        return { ...result, revision: v.revision + 1 };
      }
      await this.validateReferences(m, content!, kind);
      await this.ingredients(m, kind, v.id, content!);
      return (
        await query(
          m,
          `UPDATE ${versions} SET content=$2,media_id=$3,revision=revision+1 WHERE id=$1 RETURNING *`,
          [v.id, content, content!.mediaId],
        )
      )[0];
    });
  }
  async archive(kind: Kind, id: string) {
    return this.db.transaction(async (m) => {
      const [items] = tables[kind];
      const [item] = await query(
        m,
        `SELECT * FROM ${items} WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!item) throw new ApiError('NOT_FOUND', 404);
      await query(m, `UPDATE ${items} SET archived=true WHERE id=$1`, [id]);
      return { id, archived: true };
    });
  }
  async ingredientList(
    limit: number,
    offset: number,
    filters: {
      search?: string;
      status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      includeArchived?: boolean;
      ids?: string[];
    } = {},
  ) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.ids?.length) {
      params.push(filters.ids);
      conditions.push(`i.id = ANY($${params.length}::uuid[])`);
    }
    if (filters.status === 'ARCHIVED') {
      conditions.push('i.archived');
    } else if (
      filters.status === 'PUBLISHED' ||
      filters.includeArchived === false
    ) {
      conditions.push('NOT i.archived');
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(i.title ILIKE $${params.length} OR i.slug ILIKE $${params.length})`,
      );
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [rows, countRows] = await Promise.all([
      query(
        this.db,
        `SELECT i.*,(SELECT description FROM food_reference_items WHERE id=i.id) AS description,ARRAY(SELECT allergen_code FROM ingredient_allergens WHERE ingredient_id=i.id ORDER BY allergen_code) AS allergen_codes FROM ingredients i ${whereClause} ORDER BY i.slug LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset],
      ),
      query(
        this.db,
        `SELECT count(*)::integer AS total FROM ingredients i ${whereClause}`,
        params,
      ),
    ]);

    return {
      items: rows,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
    };
  }
  async saveIngredient(
    data: z.infer<typeof dto.ingredient>,
    slug?: string,
    id?: string,
  ) {
    return this.db.transaction(async (m) => {
      const codes = [...new Set(data.allergenCodes)];
      const known = await query(
        m,
        `SELECT code FROM allergens WHERE active AND code=ANY($1::text[])`,
        [codes],
      );
      const knownCodes = new Set(
        known.map((row: { code: string }) => row.code),
      );
      const unknown = codes.find((code) => !knownCodes.has(code));
      if (unknown)
        throw new ApiError(
          'ALLERGEN_CODE_NOT_FOUND',
          422,
          `Allergen value "${unknown}" is unavailable or inactive. Fetch GET /references/allergens for currently available values.`,
          { allergen_code: unknown },
        );
      if (id) {
        const [row] = await query(
          m,
          `SELECT * FROM ingredients WHERE id=$1 FOR UPDATE`,
          [id],
        );
        if (!row) throw new ApiError('NOT_FOUND', 404);
        if (row.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
        await query(
          m,
          `UPDATE ingredients SET title=$2,dietary_tags=$3,verification_status=$4,metadata_version=metadata_version+1 WHERE id=$1`,
          [id, data.title, data.dietaryTags, data.verificationStatus],
        );
        await query(
          m,
          `UPDATE food_reference_items SET name=$2,description=CASE WHEN $4::boolean THEN $3::text ELSE description END WHERE id=$1`,
          [
            id,
            foodDisplay(data.title).name,
            data.description ?? null,
            data.description !== undefined,
          ],
        );
      } else {
        id = randomUUID();
        await query(
          m,
          `INSERT INTO food_reference_items(id,name,kind,description) VALUES($1,$2,'INGREDIENT',$3)`,
          [id, ...Object.values(foodDisplay(data.title, data.description))],
        );
        await query(
          m,
          `INSERT INTO ingredients(id,slug,title,dietary_tags,verification_status) VALUES($1,$2,$3,$4,$5)`,
          [id, slug, data.title, data.dietaryTags, data.verificationStatus],
        );
      }
      await query(
        m,
        `DELETE FROM ingredient_allergens WHERE ingredient_id=$1`,
        [id],
      );
      if (codes.length) {
        await query(
          m,
          `INSERT INTO ingredient_allergens(ingredient_id, allergen_code)
           SELECT $1, code FROM unnest($2::text[]) AS code`,
          [id, codes],
        );
      }
      return (
        await query(
          m,
          `SELECT i.*,(SELECT description FROM food_reference_items WHERE id=i.id) AS description FROM ingredients i WHERE id=$1`,
          [id],
        )
      )[0];
    });
  }
  async getIngredient(id: string) {
    const [row] = await query(
      this.db,
      `SELECT i.*,(SELECT description FROM food_reference_items WHERE id=i.id) AS description,ARRAY(SELECT allergen_code FROM ingredient_allergens WHERE ingredient_id=i.id ORDER BY allergen_code) AS allergen_codes FROM ingredients i WHERE id=$1`,
      [id],
    );
    if (!row) throw new ApiError('NOT_FOUND', 404);
    return row;
  }
  async archiveIngredient(id: string) {
    return this.db.transaction(async (m) => {
      const [current] = await query(
        m,
        `SELECT * FROM ingredients WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!current) throw new ApiError('NOT_FOUND', 404);
      if (current.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
      return (
        await query(
          m,
          `UPDATE ingredients SET archived=true,metadata_version=metadata_version+1 WHERE id=$1 RETURNING *`,
          [id],
        )
      )[0];
    });
  }
}
