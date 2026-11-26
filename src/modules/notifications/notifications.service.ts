import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { z } from 'zod';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import {
  notificationsQuery,
  registerPushTokenInput,
  waterReminderInput,
} from './notifications.dto';
import { PushNotificationService } from './push-notification.service';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Optional()
    @Inject(PushNotificationService)
    private readonly push?: PushNotificationService,
  ) {}

  async list(userId: string, input: z.infer<typeof notificationsQuery>) {
    const items = await query(
      this.db,
      `SELECT id, type, title, body, payload,
              read_at AS "readAt", created_at AS "createdAt"
       FROM notifications
       WHERE user_id=$1 AND ($2::boolean IS FALSE OR read_at IS NULL)
       ORDER BY created_at DESC, id DESC
       LIMIT $3 OFFSET $4`,
      [userId, Boolean(input.unreadOnly), input.limit, input.offset],
    );
    const [counts] = await query(
      this.db,
      `SELECT count(*) FILTER (WHERE read_at IS NULL)::integer AS "unreadCount"
       FROM notifications WHERE user_id=$1`,
      [userId],
    );
    return {
      items,
      unreadCount: counts?.unreadCount ?? 0,
      limit: input.limit,
      offset: input.offset,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const [updated] = await query(
      this.db,
      `UPDATE notifications
       SET read_at = coalesce(read_at, now())
       WHERE id=$1 AND user_id=$2
       RETURNING id, type, title, body, payload,
                 read_at AS "readAt", created_at AS "createdAt"`,
      [notificationId, userId],
    );
    if (!updated) throw new ApiError('NOT_FOUND', 404);
    return updated;
  }

  async markAllRead(userId: string) {
    const updated = await query(
      this.db,
      `UPDATE notifications
       SET read_at = now()
       WHERE user_id=$1 AND read_at IS NULL
       RETURNING id`,
      [userId],
    );
    return {
      updatedCount: updated.length,
      unreadCount: 0,
    };
  }

  async registerPushToken(
    userId: string,
    input: z.infer<typeof registerPushTokenInput>,
  ) {
    const [saved] = await query(
      this.db,
      `INSERT INTO user_push_tokens (
         id, user_id, token, platform, device_id, app_version, locale, last_seen_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             device_id = COALESCE(EXCLUDED.device_id, user_push_tokens.device_id),
             app_version = COALESCE(EXCLUDED.app_version, user_push_tokens.app_version),
             locale = COALESCE(EXCLUDED.locale, user_push_tokens.locale),
             last_seen_at = now(),
             updated_at = now()
       RETURNING id,
                 platform,
                 device_id AS "deviceId",
                 app_version AS "appVersion",
                 locale,
                 last_seen_at AS "lastSeenAt",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [
        randomUUID(),
        userId,
        input.token,
        input.platform,
        input.deviceId ?? null,
        input.appVersion ?? null,
        input.locale ?? null,
      ],
    );
    return {
      ...saved,
      pushConfigured: Boolean(this.push?.isConfigured()),
    };
  }

  async unregisterPushToken(userId: string, token: string) {
    const deleted = await query(
      this.db,
      `DELETE FROM user_push_tokens
       WHERE user_id = $1 AND token = $2
       RETURNING id`,
      [userId, token],
    );
    return {
      removed: deleted.length > 0,
    };
  }

  async getWaterReminders(
    userId: string,
    manager: DataSource | EntityManager = this.db,
  ) {
    const [row] = await query(
      manager,
      `SELECT s.water_reminder_enabled AS enabled,
              s.water_reminder_interval_minutes AS "intervalMinutes",
              to_char(s.water_reminder_start, 'HH24:MI') AS "windowStart",
              to_char(s.water_reminder_end, 'HH24:MI') AS "windowEnd",
              s.water_reminder_stop_on_goal AS "stopWhenGoalReached",
              s.water_goal_ml AS "waterGoalMl",
              p.timezone,
              (now() AT TIME ZONE p.timezone)::date::text AS today,
              to_char(now() AT TIME ZONE p.timezone, 'HH24:MI') AS "localTime",
              coalesce((
                SELECT sum(w.milliliters)::integer
                FROM water_logs w
                WHERE w.user_id = p.user_id
                  AND w.local_date = (now() AT TIME ZONE p.timezone)::date
              ), 0) AS "todayWaterMl"
       FROM user_settings s
       JOIN user_profiles p ON p.user_id = s.user_id
       WHERE s.user_id = $1`,
      [userId],
    );
    if (!row) throw new ApiError('NOT_FOUND', 404);
    const goalReachedToday = row.todayWaterMl >= row.waterGoalMl;
    const nextReminderLocalTime = this.computeNextReminderLocalTime({
      enabled: row.enabled,
      intervalMinutes: row.intervalMinutes,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      stopWhenGoalReached: row.stopWhenGoalReached,
      goalReachedToday,
      localTime: row.localTime,
      today: row.today,
    });
    return {
      enabled: row.enabled,
      intervalMinutes: row.intervalMinutes,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      stopWhenGoalReached: row.stopWhenGoalReached,
      waterGoalMl: row.waterGoalMl,
      todayWaterMl: row.todayWaterMl,
      goalReachedToday,
      timezone: row.timezone,
      nextReminderLocalAt: nextReminderLocalTime,
    };
  }

  async updateWaterReminders(
    userId: string,
    input: z.infer<typeof waterReminderInput>,
  ) {
    if (input.windowStart >= input.windowEnd) {
      throw new ApiError(
        'INVALID_REMINDER_WINDOW',
        422,
        'Water reminder start time must be earlier than end time.',
      );
    }
    return this.db.transaction(async (manager) => {
      const [updated] = await query(
        manager,
        `UPDATE user_settings
         SET water_reminder_enabled = $2,
             water_reminder_interval_minutes = $3,
             water_reminder_start = $4::time,
             water_reminder_end = $5::time,
             water_reminder_stop_on_goal = $6,
             version = version + 1
         WHERE user_id = $1
         RETURNING user_id`,
        [
          userId,
          input.enabled,
          input.intervalMinutes,
          input.windowStart,
          input.windowEnd,
          input.stopWhenGoalReached,
        ],
      );
      if (!updated) throw new ApiError('NOT_FOUND', 404);
      return this.getWaterReminders(userId, manager);
    });
  }

  private computeNextReminderLocalTime(params: {
    enabled: boolean;
    intervalMinutes: number;
    windowStart: string;
    windowEnd: string;
    stopWhenGoalReached: boolean;
    goalReachedToday: boolean;
    localTime: string;
    today: string;
  }): string | null {
    if (!params.enabled) return null;
    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const formatHHMM = (totalMinutes: number) => {
      const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const m = String(totalMinutes % 60).padStart(2, '0');
      return `${h}:${m}`;
    };
    const nextDay = (isoDate: string) => {
      const d = new Date(`${isoDate}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };

    const startMin = toMinutes(params.windowStart);
    const endMin = toMinutes(params.windowEnd);
    const nowMin = toMinutes(params.localTime);

    if (params.stopWhenGoalReached && params.goalReachedToday) {
      return `${nextDay(params.today)}T${params.windowStart}:00`;
    }
    if (nowMin < startMin) {
      return `${params.today}T${params.windowStart}:00`;
    }
    const elapsed = nowMin - startMin;
    const steps = Math.floor(elapsed / params.intervalMinutes) + 1;
    const candidateMin = startMin + steps * params.intervalMinutes;
    if (candidateMin <= endMin) {
      return `${params.today}T${formatHHMM(candidateMin)}:00`;
    }
    return `${nextDay(params.today)}T${params.windowStart}:00`;
  }
}
