import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import {
  adminFaqCreateInput,
  adminFaqPatchInput,
  adminLegalCreateInput,
  faqPublicQuery,
} from './support.dto';

@Injectable()
export class SupportService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async listPublicFaq(filters: z.infer<typeof faqPublicQuery>) {
    const search = filters.q ? `%${filters.q}%` : null;
    const items = await query(
      this.db,
      `SELECT id, slug, category, locale, question, answer,
              display_order AS "displayOrder"
       FROM faq_entries
       WHERE active
         AND ($1::text IS NULL OR locale = $1)
         AND ($2::text IS NULL OR lower(category) = lower($2))
         AND ($3::text IS NULL OR question ILIKE $3 OR answer ILIKE $3)
       ORDER BY display_order ASC, created_at ASC`,
      [filters.locale ?? null, filters.category ?? null, search],
    );
    return { items };
  }

  async getActiveLegalDocument(type: 'TERMS' | 'PRIVACY', locale: 'en' | 'ar') {
    const [doc] = await query(
      this.db,
      `SELECT id, type, version, locale, title, content,
              published_at AS "publishedAt"
       FROM legal_documents
       WHERE type=$1 AND locale=$2 AND active
       LIMIT 1`,
      [type, locale],
    );
    if (!doc) throw new ApiError('NOT_FOUND', 404);
    return doc;
  }

  async listUserLegalAcceptances(userId: string) {
    const items = await query(
      this.db,
      `SELECT a.id, a.legal_document_id AS "documentId",
              d.type, d.version, d.locale, d.title, d.active,
              a.accepted_at AS "acceptedAt"
       FROM legal_acceptances a
       JOIN legal_documents d ON d.id = a.legal_document_id
       WHERE a.user_id = $1
       ORDER BY a.accepted_at DESC`,
      [userId],
    );
    const activeDocuments = await query(
      this.db,
      `SELECT d.id, d.type, d.version, d.locale, d.title,
              d.published_at AS "publishedAt",
              (a.id IS NOT NULL) AS accepted,
              a.accepted_at AS "acceptedAt"
       FROM legal_documents d
       LEFT JOIN legal_acceptances a
         ON a.legal_document_id = d.id AND a.user_id = $1
       WHERE d.active
       ORDER BY d.locale ASC, d.type ASC`,
      [userId],
    );
    return { items, activeDocuments };
  }

  async acceptLegalDocument(userId: string, documentId: string) {
    return this.db.transaction(async (manager) => {
      const [doc] = await query(
        manager,
        `SELECT id, type, version, locale, title
         FROM legal_documents WHERE id=$1`,
        [documentId],
      );
      if (!doc) throw new ApiError('NOT_FOUND', 404);
      const [acceptance] = await query(
        manager,
        `INSERT INTO legal_acceptances(id, user_id, legal_document_id)
         VALUES($1, $2, $3)
         ON CONFLICT (user_id, legal_document_id) DO UPDATE
           SET accepted_at = legal_acceptances.accepted_at
         RETURNING id, accepted_at AS "acceptedAt"`,
        [randomUUID(), userId, documentId],
      );
      return {
        id: acceptance.id,
        documentId: doc.id,
        type: doc.type,
        version: doc.version,
        locale: doc.locale,
        title: doc.title,
        acceptedAt: acceptance.acceptedAt,
      };
    });
  }

  async listAdminFaq() {
    const items = await query(
      this.db,
      `SELECT id, slug, category, locale, question, answer,
              display_order AS "displayOrder", active,
              created_at AS "createdAt"
       FROM faq_entries
       ORDER BY locale ASC, display_order ASC, created_at ASC`,
    );
    return { items };
  }

  async createAdminFaq(input: z.infer<typeof adminFaqCreateInput>) {
    const [existing] = await query(
      this.db,
      'SELECT id FROM faq_entries WHERE slug=$1',
      [input.slug],
    );
    if (existing) {
      throw new ApiError(
        'FAQ_SLUG_TAKEN',
        409,
        'An FAQ entry with this slug already exists.',
      );
    }
    const [created] = await query(
      this.db,
      `INSERT INTO faq_entries(
         id, slug, category, locale, question, answer, display_order, active
       )
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, slug, category, locale, question, answer,
                 display_order AS "displayOrder", active,
                 created_at AS "createdAt"`,
      [
        randomUUID(),
        input.slug,
        input.category,
        input.locale,
        input.question,
        input.answer,
        input.displayOrder,
        input.active,
      ],
    );
    return created;
  }

  async updateAdminFaq(id: string, input: z.infer<typeof adminFaqPatchInput>) {
    const [updated] = await query(
      this.db,
      `UPDATE faq_entries
       SET category = coalesce($2, category),
           locale = coalesce($3, locale),
           question = coalesce($4, question),
           answer = coalesce($5, answer),
           display_order = coalesce($6, display_order),
           active = coalesce($7, active)
       WHERE id = $1
       RETURNING id, slug, category, locale, question, answer,
                 display_order AS "displayOrder", active,
                 created_at AS "createdAt"`,
      [
        id,
        input.category ?? null,
        input.locale ?? null,
        input.question ?? null,
        input.answer ?? null,
        input.displayOrder ?? null,
        input.active ?? null,
      ],
    );
    if (!updated) throw new ApiError('NOT_FOUND', 404);
    return updated;
  }

  async deleteAdminFaq(id: string) {
    const [deleted] = await query(
      this.db,
      'DELETE FROM faq_entries WHERE id=$1 RETURNING id',
      [id],
    );
    if (!deleted) throw new ApiError('NOT_FOUND', 404);
    return { id: deleted.id, deleted: true };
  }

  async listAdminLegal() {
    const items = await query(
      this.db,
      `SELECT id, type, version, locale, title, content, active,
              published_at AS "publishedAt"
       FROM legal_documents
       ORDER BY locale ASC, type ASC, active DESC, published_at DESC`,
    );
    return { items };
  }

  async createAdminLegal(input: z.infer<typeof adminLegalCreateInput>) {
    return this.db.transaction(async (manager) => {
      const [duplicate] = await query(
        manager,
        `SELECT id FROM legal_documents
         WHERE type=$1 AND version=$2 AND locale=$3`,
        [input.type, input.version, input.locale],
      );
      if (duplicate) {
        throw new ApiError(
          'LEGAL_VERSION_EXISTS',
          409,
          'A legal document with this type, version, and locale already exists.',
        );
      }
      if (input.active) {
        await query(
          manager,
          `UPDATE legal_documents
           SET active = false
           WHERE type=$1 AND locale=$2 AND active`,
          [input.type, input.locale],
        );
      }
      const [created] = await query(
        manager,
        `INSERT INTO legal_documents(
           id, type, version, locale, title, content, active
         )
         VALUES($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, type, version, locale, title, content, active,
                   published_at AS "publishedAt"`,
        [
          randomUUID(),
          input.type,
          input.version,
          input.locale,
          input.title,
          input.content,
          input.active,
        ],
      );
      return created;
    });
  }
}
