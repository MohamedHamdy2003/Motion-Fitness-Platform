import { z } from 'zod';

export const faqPublicQuery = z
  .object({
    locale: z.enum(['en', 'ar']).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    q: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const legalPublicQuery = z
  .object({
    locale: z.enum(['en', 'ar']).default('en'),
  })
  .strict();

export const legalAcceptanceInput = z
  .object({
    documentId: z.uuid(),
  })
  .strict();

export const adminFaqCreateInput = z
  .object({
    category: z.string().trim().min(1).max(80),
    questionAr: z.string().trim().min(1).max(500),
    answerAr: z.string().trim().min(1).max(5000),
    questionEn: z.string().trim().min(1).max(500),
    answerEn: z.string().trim().min(1).max(5000),
    displayOrder: z.number().int().min(0).max(10000).default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const adminFaqPatchInput = z
  .object({
    category: z.string().trim().min(1).max(80).optional(),
    questionAr: z.string().trim().min(1).max(500).optional(),
    answerAr: z.string().trim().min(1).max(5000).optional(),
    questionEn: z.string().trim().min(1).max(500).optional(),
    answerEn: z.string().trim().min(1).max(5000).optional(),
    displayOrder: z.number().int().min(0).max(10000).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export const adminLegalCreateInput = z
  .object({
    type: z.enum(['TERMS', 'PRIVACY']),
    version: z.string().trim().min(1).max(64).optional(),
    locale: z.enum(['en', 'ar']).default('en'),
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(50000),
    active: z.boolean().default(true),
  })
  .strict();
