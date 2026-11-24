import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError } from '../../common/http';
import { query } from '../../infrastructure/database/query';

interface TraineeRow {
  id: string;
  email: string | null;
  status: string;
  verified: boolean;
  createdAt: string;
  name: string | null;
  primaryGoal: string | null;
  fitnessLevel: string | null;
  onboardedAt: string | null;
  activeProgramTitle: string | null;
  completedWorkouts: number;
  completedMeals: number;
}

@Injectable()
export class AdminUsersService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async listTrainees(options: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;
    const params: unknown[] = [];
    const conditions: string[] = [
      `NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_code = 'ADMIN')`,
    ];

    if (options.status) {
      params.push(options.status);
      conditions.push(`u.status = $${params.length}`);
    }

    if (options.search) {
      params.push(`%${options.search.toLowerCase()}%`);
      conditions.push(
        `(lower(coalesce(u.email_normalized, '')) LIKE $${params.length} OR lower(coalesce(p.name, '')) LIKE $${params.length})`,
      );
    }

    const where = conditions.join(' AND ');
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const [rows, filteredCountRows, counts] = await Promise.all([
      query(
        this.db,
        `SELECT
           u.id,
           u.email_normalized AS email,
           u.status,
           (u.verified_at IS NOT NULL) AS verified,
           u.created_at AS "createdAt",
           p.name,
           p.primary_goal AS "primaryGoal",
           p.fitness_level AS "fitnessLevel",
           p.onboarded_at AS "onboardedAt",
           (
             SELECT pv.title
             FROM program_enrollments pe
             JOIN program_versions pv ON pv.id = pe.program_version_id
             WHERE pe.user_id = u.id AND pe.ended_at IS NULL
             ORDER BY pe.starts_on DESC
             LIMIT 1
           ) AS "activeProgramTitle",
           (
             SELECT count(*)::integer
             FROM workout_sessions ws
             WHERE ws.user_id = u.id AND ws.status = 'COMPLETED'
           ) AS "completedWorkouts",
           (
             SELECT count(*)::integer
             FROM scheduled_meals sm
             JOIN nutrition_days nd ON nd.id = sm.nutrition_day_id
             JOIN program_enrollments pe ON pe.id = nd.enrollment_id
             WHERE pe.user_id = u.id AND sm.status = 'COMPLETED'
           ) AS "completedMeals"
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE ${where}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset],
      ),
      query(
        this.db,
        `SELECT count(*)::integer AS total
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE ${where}`,
        params,
      ),
      query(
        this.db,
        `SELECT
           count(*)::integer AS total,
           count(*) FILTER (WHERE u.status = 'ACTIVE')::integer AS active,
           count(*) FILTER (WHERE u.status = 'SUSPENDED')::integer AS suspended,
           count(*) FILTER (WHERE p.onboarded_at IS NOT NULL)::integer AS onboarded
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_code = 'ADMIN')`,
      ),
    ]);

    return {
      items: rows as TraineeRow[],
      total: filteredCountRows[0]?.total ?? 0,
      limit,
      offset,
      summary: counts[0] ?? { total: 0, active: 0, suspended: 0, onboarded: 0 },
    };
  }

  async updateStatus(userId: string, nextStatus: 'ACTIVE' | 'SUSPENDED') {
    return this.db.transaction(async (m) => {
      const [user] = await query(
        m,
        `SELECT
           u.id,
           u.status,
           EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_code = 'ADMIN') AS "isAdmin"
         FROM users u
         WHERE u.id = $1
         FOR UPDATE`,
        [userId],
      );

      if (!user) throw new ApiError('USER_NOT_FOUND', 404, 'User not found.');
      if (user.isAdmin) {
        throw new ApiError(
          'CANNOT_MODIFY_ADMIN',
          403,
          'Administrator accounts cannot be modified from trainee management.',
        );
      }
      if (user.status === 'DELETION_PENDING') {
        throw new ApiError(
          'USER_DELETION_PENDING',
          409,
          'This account is already queued for deletion.',
        );
      }

      await query(m, `UPDATE users SET status = $2 WHERE id = $1`, [
        userId,
        nextStatus,
      ]);

      if (nextStatus === 'SUSPENDED') {
        await query(
          m,
          `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
        await query(
          m,
          `UPDATE auth_refresh_tokens SET revoked_at = now()
           WHERE session_id IN (SELECT id FROM auth_sessions WHERE user_id = $1)
             AND revoked_at IS NULL`,
          [userId],
        );
      }

      return { id: userId, status: nextStatus };
    });
  }

  async deleteTrainee(userId: string) {
    return this.db.transaction(async (m) => {
      const [user] = await query(
        m,
        `SELECT
           u.id,
           EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_code = 'ADMIN') AS "isAdmin"
         FROM users u
         WHERE u.id = $1
         FOR UPDATE`,
        [userId],
      );

      if (!user) throw new ApiError('USER_NOT_FOUND', 404, 'User not found.');
      if (user.isAdmin) {
        throw new ApiError(
          'CANNOT_DELETE_ADMIN',
          403,
          'Administrator accounts cannot be deleted.',
        );
      }

      await query(m, `DELETE FROM users WHERE id = $1`, [userId]);
      return { deleted: true, id: userId };
    });
  }
}
