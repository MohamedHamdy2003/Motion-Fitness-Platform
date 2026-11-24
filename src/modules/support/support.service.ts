import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import {
  adminFaqCreateInput,
  adminFaqListQuery,
  adminFaqPatchInput,
  adminLegalCreateInput,
  adminLegalListQuery,
  faqPublicQuery,
} from './support.dto';

function bumpLegalVersion(existingVersions: string[]): string {
  let maxMajor = 1;
  let maxMinor = -1;
  for (const raw of existingVersions) {
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(raw || '').trim());
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major > maxMajor || (major === maxMajor && minor > maxMinor)) {
      maxMajor = major;
      maxMinor = minor;
    }
  }
  if (maxMinor < 0) return '1.0.0';
  return `${maxMajor}.${maxMinor + 1}.0`;
}

@Injectable()
export class SupportService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async listPublicFaq(filters: z.infer<typeof faqPublicQuery>) {
    const search = filters.q ? `%${filters.q}%` : null;
    const rows = await query(
      this.db,
      `SELECT id, category,
              question_ar AS "questionAr", answer_ar AS "answerAr",
              question_en AS "questionEn", answer_en AS "answerEn",
              display_order AS "displayOrder"
       FROM faq_entries
       WHERE active
         AND ($1::text IS NULL OR lower(category) = lower($1))
         AND ($2::text IS NULL
              OR question_ar ILIKE $2 OR answer_ar ILIKE $2
              OR question_en ILIKE $2 OR answer_en ILIKE $2)
       ORDER BY display_order ASC, created_at ASC`,
      [filters.category ?? null, search],
    );
    const locale = filters.locale ?? 'en';
    const items = rows.map(
      (row: {
        id: string;
        category: string;
        questionAr: string;
        answerAr: string;
        questionEn: string;
        answerEn: string;
        displayOrder: number;
      }) => ({
        id: row.id,
        category: row.category,
        locale,
        question: locale === 'ar' ? row.questionAr : row.questionEn,
        answer: locale === 'ar' ? row.answerAr : row.answerEn,
        questionAr: row.questionAr,
        answerAr: row.answerAr,
        questionEn: row.questionEn,
        answerEn: row.answerEn,
        displayOrder: row.displayOrder,
      }),
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

  async listAdminFaq(
    filters: z.infer<typeof adminFaqListQuery> = { limit: 10, offset: 0 },
  ) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.category) {
      params.push(filters.category);
      conditions.push(`lower(category) = lower($${params.length})`);
    }
    if (filters.status === 'ACTIVE') {
      conditions.push('active');
    } else if (filters.status === 'INACTIVE') {
      conditions.push('NOT active');
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(question_ar ILIKE $${params.length} OR answer_ar ILIKE $${params.length} OR question_en ILIKE $${params.length} OR answer_en ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [items, countRows] = await Promise.all([
      query(
        this.db,
        `SELECT id, category,
                question_ar AS "questionAr", answer_ar AS "answerAr",
                question_en AS "questionEn", answer_en AS "answerEn",
                display_order AS "displayOrder", active,
                created_at AS "createdAt"
         FROM faq_entries
         ${where}
         ORDER BY display_order ASC, created_at ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, filters.limit, filters.offset],
      ),
      query(
        this.db,
        `SELECT count(*)::integer AS total FROM faq_entries ${where}`,
        params,
      ),
    ]);

    return {
      items,
      total: countRows[0]?.total ?? 0,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async createAdminFaq(input: z.infer<typeof adminFaqCreateInput>) {
    const [created] = await query(
      this.db,
      `INSERT INTO faq_entries(
         id, category, question_ar, answer_ar, question_en, answer_en, display_order, active
       )
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, category,
                 question_ar AS "questionAr", answer_ar AS "answerAr",
                 question_en AS "questionEn", answer_en AS "answerEn",
                 display_order AS "displayOrder", active,
                 created_at AS "createdAt"`,
      [
        randomUUID(),
        input.category,
        input.questionAr,
        input.answerAr,
        input.questionEn,
        input.answerEn,
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
           question_ar = coalesce($3, question_ar),
           answer_ar = coalesce($4, answer_ar),
           question_en = coalesce($5, question_en),
           answer_en = coalesce($6, answer_en),
           display_order = coalesce($7, display_order),
           active = coalesce($8, active)
       WHERE id = $1
       RETURNING id, category,
                 question_ar AS "questionAr", answer_ar AS "answerAr",
                 question_en AS "questionEn", answer_en AS "answerEn",
                 display_order AS "displayOrder", active,
                 created_at AS "createdAt"`,
      [
        id,
        input.category ?? null,
        input.questionAr ?? null,
        input.answerAr ?? null,
        input.questionEn ?? null,
        input.answerEn ?? null,
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

  async listAdminLegal(
    filters: z.infer<typeof adminLegalListQuery> = { limit: 10, offset: 0 },
  ) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.type) {
      params.push(filters.type);
      conditions.push(`type = $${params.length}`);
    }
    if (filters.locale) {
      params.push(filters.locale);
      conditions.push(`locale = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(title ILIKE $${params.length} OR version ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [items, countRows] = await Promise.all([
      query(
        this.db,
        `SELECT id, type, version, locale, title, content, active,
                published_at AS "publishedAt"
         FROM legal_documents
         ${where}
         ORDER BY locale ASC, type ASC, active DESC, published_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, filters.limit, filters.offset],
      ),
      query(
        this.db,
        `SELECT count(*)::integer AS total FROM legal_documents ${where}`,
        params,
      ),
    ]);

    return {
      items,
      total: countRows[0]?.total ?? 0,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async createAdminLegal(input: z.infer<typeof adminLegalCreateInput>) {
    return this.db.transaction(async (manager) => {
      let version = input.version?.trim();
      if (!version) {
        const existing = await query(
          manager,
          `SELECT version FROM legal_documents WHERE type=$1 AND locale=$2`,
          [input.type, input.locale],
        );
        version = bumpLegalVersion(
          existing.map((r: { version: string }) => r.version),
        );
      }
      const [duplicate] = await query(
        manager,
        `SELECT id FROM legal_documents
         WHERE type=$1 AND version=$2 AND locale=$3`,
        [input.type, version, input.locale],
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
          version,
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
