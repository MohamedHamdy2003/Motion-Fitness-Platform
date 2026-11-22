import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { z } from 'zod';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';
import { activityGoalsInput, dailyStepsInput } from './activity.dto';

@Injectable()
export class ActivityService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private async settings(
    userId: string,
    db: DataSource | EntityManager = this.db,
  ) {
    const [settings] = await query(
      db,
      `
      SELECT (now() AT TIME ZONE p.timezone)::date::text AS today,
             s.water_goal_ml AS "waterGoalMl", s.steps_goal AS "stepsGoal"
      FROM user_profiles p JOIN user_settings s USING (user_id)
      WHERE p.user_id=$1
    `,
      [userId],
    );
    if (!settings) throw new ApiError('NOT_FOUND', 404);
    return settings as {
      today: string;
      waterGoalMl: number;
      stepsGoal: number;
    };
  }

  private resolveDate(today: string, date?: string) {
    if (date && date > today) {
      throw new ApiError(
        'ACTIVITY_DATE_IN_FUTURE',
        422,
        'Activity date cannot be in the future.',
      );
    }
    return date ?? today;
  }

  async daily(userId: string, requestedDate?: string) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const { today, waterGoalMl, stepsGoal } = await this.settings(userId, m);
      const date = this.resolveDate(today, requestedDate);
      const [water] = await query(
        m,
        `
        SELECT coalesce(sum(milliliters),0)::integer AS "totalMl", count(*)::integer AS "logCount"
        FROM water_logs WHERE user_id=$1 AND local_date=$2
      `,
        [userId, date],
      );
      const recentLogs = await query(
        m,
        `
        SELECT id,milliliters,created_at AS "createdAt" FROM water_logs
        WHERE user_id=$1 AND local_date=$2 ORDER BY created_at DESC,id DESC LIMIT 50
      `,
        [userId, date],
      );
      const [steps] = await query(
        m,
        `
        SELECT steps AS count,manually_completed AS "manuallyCompleted"
        FROM daily_steps WHERE user_id=$1 AND local_date=$2
      `,
        [userId, date],
      );
      const count = steps?.count ?? 0;
      const manuallyCompleted = steps?.manuallyCompleted ?? false;
      return {
        date,
        water: {
          ...water,
          goalMl: waterGoalMl,
          goalReached: water.totalMl >= waterGoalMl,
          recentLogs,
        },
        steps: {
          count,
          goal: stepsGoal,
          manuallyCompleted,
          goalReached: manuallyCompleted || count >= stepsGoal,
        },
      };
    });
  }

  async addWater(userId: string, milliliters: number) {
    const { today } = await this.settings(userId);
    const [log] = await query(
      this.db,
      `
      INSERT INTO water_logs(id,user_id,local_date,milliliters) VALUES($1,$2,$3,$4)
      RETURNING id,local_date::text AS date,milliliters,created_at AS "createdAt"
    `,
      [randomUUID(), userId, today, milliliters],
    );
    return log;
  }

  async removeWater(userId: string, logId: string) {
    const [removed] = await query(
      this.db,
      `
      DELETE FROM water_logs WHERE user_id=$1 AND id=$2 RETURNING id
    `,
      [userId, logId],
    );
    if (!removed) throw new ApiError('NOT_FOUND', 404);
    return removed;
  }

  async setSteps(userId: string, input: z.infer<typeof dailyStepsInput>) {
    const { today, stepsGoal } = await this.settings(userId);
    const date = this.resolveDate(today, input.date);
    const [saved] = await query(
      this.db,
      `
      INSERT INTO daily_steps(user_id,local_date,steps,manually_completed)
      VALUES($1,$2,coalesce($3,0),coalesce($4,false))
      ON CONFLICT (user_id,local_date) DO UPDATE
        SET steps=coalesce($3,daily_steps.steps),manually_completed=coalesce($4,daily_steps.manually_completed)
      RETURNING steps AS count,manually_completed AS "manuallyCompleted"
    `,
      [userId, date, input.steps ?? null, input.manuallyCompleted ?? null],
    );
    return {
      date,
      ...saved,
      goal: stepsGoal,
      goalReached: saved.manuallyCompleted || saved.count >= stepsGoal,
    };
  }

  async setGoals(userId: string, input: z.infer<typeof activityGoalsInput>) {
    const [saved] = await query(
      this.db,
      `
      UPDATE user_settings SET water_goal_ml=coalesce($2,2500),steps_goal=coalesce($3,10000)
      WHERE user_id=$1 RETURNING water_goal_ml AS "waterGoalMl",steps_goal AS "stepsGoal"
    `,
      [userId, input.waterGoalMl, input.stepsGoal],
    );
    if (!saved) throw new ApiError('NOT_FOUND', 404);
    return saved;
  }
}
