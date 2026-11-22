import { z } from 'zod';

const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const notificationsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
    unreadOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict();

export const waterReminderInput = z
  .object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(15).max(480),
    windowStart: timeHHMM,
    windowEnd: timeHHMM,
    stopWhenGoalReached: z.boolean().default(true),
  })
  .strict();
