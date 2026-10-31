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
  async list(kind: Kind, limit: number, offset: number) {
    const [items, versions, fk] = tables[kind];
    return query(
      this.db,
      `SELECT i.*,v.id AS version_id,v.version,v.revision,v.status,v.content FROM ${items} i JOIN LATERAL (SELECT * FROM ${versions} WHERE ${fk}=i.id ORDER BY version DESC LIMIT 1) v ON true ORDER BY i.slug LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
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
          `INSERT INTO food_reference_items(id,name,kind) VALUES($1,$2,'FOOD')`,
          [id, content.title],
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
    if (kind === 'foods')
      for (const ingredient of (content as z.infer<typeof dto.food>)
        .ingredients) {
        const [row] = await query(
          m,
          `SELECT id FROM ingredients WHERE id=$1 AND NOT archived FOR SHARE`,
          [ingredient.ingredientId],
        );
        if (!row) throw new ApiError('INGREDIENT_UNAVAILABLE', 422);
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
    for (const i of (content as z.infer<typeof dto.food>).ingredients)
      await query(m, `INSERT INTO food_ingredients VALUES($1,$2,$3)`, [
        id,
        i.ingredientId,
        i.quantityG,
      ]);
  }
  async revise(
    kind: Kind,
    id: string,
    expectedRevision: number,
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
      if (v.revision !== expectedRevision)
        throw new ApiError('REVISION_CONFLICT', 409);
      if (publish) {
        if (v.status !== 'DRAFT') throw new ApiError('ALREADY_PUBLISHED', 409);
        await this.validateReferences(m, v.content, kind);
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
  async archive(kind: Kind, id: string, revision: number) {
    return this.db.transaction(async (m) => {
      const [items, versions, fk] = tables[kind];
      const [item] = await query(
        m,
        `SELECT * FROM ${items} WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!item) throw new ApiError('NOT_FOUND', 404);
      const [v] = await query(
        m,
        `SELECT revision FROM ${versions} WHERE ${fk}=$1 ORDER BY version DESC LIMIT 1`,
        [id],
      );
      if (v.revision !== revision) throw new ApiError('REVISION_CONFLICT', 409);
      await query(m, `UPDATE ${items} SET archived=true WHERE id=$1`, [id]);
      return { id, archived: true };
    });
  }
  async ingredientList(limit: number, offset: number) {
    return query(
      this.db,
      `SELECT i.*,ARRAY(SELECT allergen_code FROM ingredient_allergens WHERE ingredient_id=i.id ORDER BY allergen_code) AS allergen_codes FROM ingredients i ORDER BY slug LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }
  async saveIngredient(
    data: z.infer<typeof dto.ingredient>,
    slug?: string,
    id?: string,
    revision?: number,
  ) {
    return this.db.transaction(async (m) => {
      const codes = [...new Set(data.allergenCodes)];
      const known = await query(
        m,
        `SELECT code FROM allergens WHERE code=ANY($1::text[])`,
        [codes],
      );
      if (known.length !== codes.length)
        throw new ApiError('UNKNOWN_ALLERGEN', 422);
      if (id) {
        const [row] = await query(
          m,
          `SELECT * FROM ingredients WHERE id=$1 FOR UPDATE`,
          [id],
        );
        if (!row) throw new ApiError('NOT_FOUND', 404);
        if (row.metadata_version !== revision)
          throw new ApiError('REVISION_CONFLICT', 409);
        if (row.archived) throw new ApiError('CONTENT_ARCHIVED', 409);
        await query(
          m,
          `UPDATE ingredients SET title=$2,dietary_tags=$3,verification_status=$4,metadata_version=metadata_version+1 WHERE id=$1`,
          [id, data.title, data.dietaryTags, data.verificationStatus],
        );
        await query(m, `UPDATE food_reference_items SET name=$2 WHERE id=$1`, [
          id,
          data.title,
        ]);
      } else {
        id = randomUUID();
        await query(
          m,
          `INSERT INTO food_reference_items VALUES($1,$2,'INGREDIENT')`,
          [id, data.title],
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
      for (const code of codes)
        await query(m, `INSERT INTO ingredient_allergens VALUES($1,$2)`, [
          id,
          code,
        ]);
      return (await query(m, `SELECT * FROM ingredients WHERE id=$1`, [id]))[0];
    });
  }
  async getIngredient(id: string) {
    const [row] = await query(
      this.db,
      `SELECT i.*,ARRAY(SELECT allergen_code FROM ingredient_allergens WHERE ingredient_id=i.id ORDER BY allergen_code) AS allergen_codes FROM ingredients i WHERE id=$1`,
      [id],
    );
    if (!row) throw new ApiError('NOT_FOUND', 404);
    return row;
  }
  async archiveIngredient(id: string, revision: number) {
    const [row] = await query(
      this.db,
      `UPDATE ingredients SET archived=true,metadata_version=metadata_version+1 WHERE id=$1 AND metadata_version=$2 RETURNING *`,
      [id, revision],
    );
    if (!row) {
      await this.getIngredient(id);
      throw new ApiError('REVISION_CONFLICT', 409);
    }
    return row;
  }
}
