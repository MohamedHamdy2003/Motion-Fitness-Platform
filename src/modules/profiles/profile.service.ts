import { query } from '../../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../common/http';
import { environment } from '../../config/environment';
import * as dto from './profile.dto';
import { assertAgeEligible } from './profile.policy';

@Injectable()
export class ProfileService {
  constructor(@Inject(DataSource) public db: DataSource) {}
  async lock(m: EntityManager, id: string) {
    const [u] = await query(
      m,
      `SELECT id FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE`,
      [id],
    );
    if (!u) throw new ApiError('ACCOUNT_UNAVAILABLE', 403);
  }
  async event(m: EntityManager, id: string, type: string, revision: number) {
    await query(
      m,
      `INSERT INTO domain_events(id,user_id,type,revision) VALUES($1,$2,$3,$4)`,
      [randomUUID(), id, type, revision],
    );
  }
  async me(id: string) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [u] = await query(
        m,
        `SELECT id,email_normalized AS email,verified_at FROM users WHERE id=$1`,
        [id],
      );
      const [profile] = await query(
        m,
        `SELECT * FROM user_profiles WHERE user_id=$1`,
        [id],
      );
      const [state] = await query(
        m,
        `SELECT injury_revision FROM user_restriction_states WHERE user_id=$1`,
        [id],
      );
      const injuries = await query(
        m,
        `SELECT * FROM user_injuries WHERE user_id=$1 AND status='ACTIVE' ORDER BY confirmed_at,id`,
        [id],
      );
      return {
        user: u,
        profile,
        injuries,
        injury_revision: state.injury_revision,
        food_preferences: await this.getPreferences(id, m),
        matching: {
          status: profile.onboarded_at ? 'PENDING' : 'NOT_STARTED',
          reason: 'F05_NOT_IMPLEMENTED',
        },
      };
    });
  }
  async updateProfile(
    m: EntityManager,
    id: string,
    input: Record<string, unknown>,
    expected: number,
  ) {
    if (input.date_of_birth || input.timezone) {
      const [current] = await query(
        m,
        `SELECT date_of_birth::text,timezone FROM user_profiles WHERE user_id=$1`,
        [id],
      );
      const birth = input.date_of_birth || current.date_of_birth;
      if (birth)
        assertAgeEligible(
          String(birth),
          String(input.timezone || current.timezone),
        );
    }
    if (input.avatar_media_id) {
      const [asset] = await query(
        m,
        `SELECT id FROM media_assets WHERE id=$1 AND owner_user_id=$2 AND status='READY' AND NOT library_asset`,
        [input.avatar_media_id, id],
      );
      if (!asset) throw new ApiError('INVALID_AVATAR');
    }
    const allowed = Object.keys(dto.profileFields);
    const pairs = Object.entries(input).filter(([key]) =>
      allowed.includes(key),
    );
    const values = pairs.map(([, v]) => v);
    const [p] = await query(
      m,
      `UPDATE user_profiles SET ${pairs.map(([k], i) => `${k}=$${i + 3}`).join(',')},profile_revision=profile_revision+1 WHERE user_id=$1 AND profile_revision=$2 RETURNING *`,
      [id, expected, ...values],
    );
    if (!p) throw new ApiError('REVISION_CONFLICT', 409);
    await this.event(m, id, 'PROFILE_UPDATED', p.profile_revision);
    return p;
  }
  async patch(id: string, input: z.infer<typeof dto.profilePatch>) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      return this.updateProfile(m, id, input, input.expectedRevision);
    });
  }
  async onboard(
    id: string,
    input: z.infer<typeof dto.onboarding>,
    key: string,
  ) {
    assertAgeEligible(input.date_of_birth, input.timezone);
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      const previous = await this.idempotency(m, id, 'onboarding', key, input);
      if (previous) {
        const [profile] = await query(
          m,
          `SELECT profile_revision FROM user_profiles WHERE user_id=$1`,
          [id],
        );
        return {
          status: 'COMPLETED',
          profile_revision: profile.profile_revision,
          replayed: true,
          matching: { status: 'PENDING', reason: 'F05_NOT_IMPLEMENTED' },
        };
      }
      const { expectedRevision, ...profile } = input;
      const p = await this.updateProfile(m, id, profile, expectedRevision);
      await query(
        m,
        `UPDATE user_profiles SET onboarded_at=coalesce(onboarded_at,now()) WHERE user_id=$1`,
        [id],
      );
      await this.recordKey(m, id, 'onboarding', key, input, null);
      return {
        status: 'COMPLETED',
        profile_revision: p.profile_revision,
        matching: { status: 'PENDING', reason: 'F05_NOT_IMPLEMENTED' },
      };
    });
  }
  digest(input: unknown) {
    return createHmac('sha256', environment().JWT_SECRET)
      .update(JSON.stringify(input))
      .digest('hex');
  }
  async idempotency(
    m: EntityManager,
    id: string,
    scope: string,
    key: string,
    input: unknown,
  ) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
      throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
    const [p] = await query(
      m,
      `SELECT resource_id,body_hash FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key=$3`,
      [id, scope, key],
    );
    if (p && p.body_hash !== this.digest(input))
      throw new ApiError('IDEMPOTENCY_CONFLICT', 409);
    return p;
  }
  async recordKey(
    m: EntityManager,
    id: string,
    scope: string,
    key: string,
    input: unknown,
    resource: string | null,
  ) {
    await query(
      m,
      `INSERT INTO idempotency_keys(user_id,scope,key,body_hash,resource_id) VALUES($1,$2,$3,$4,$5)`,
      [id, scope, key, this.digest(input), resource],
    );
  }
  async getSettings(id: string) {
    const [s] = await query(
      this.db,
      `SELECT reminders,theme,quiet_hours,version FROM user_settings WHERE user_id=$1`,
      [id],
    );
    return s;
  }
  async setSettings(id: string, input: z.infer<typeof dto.settings>) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      const pairs = Object.entries(input).filter(
        ([k]) => k !== 'expectedVersion',
      );
      const [s] = await query(
        m,
        `UPDATE user_settings SET ${pairs.map(([k], i) => `${k}=$${i + 3}`).join(',')},version=version+1 WHERE user_id=$1 AND version=$2 RETURNING reminders,theme,quiet_hours,version`,
        [
          id,
          input.expectedVersion,
          ...pairs.map(([, v]) =>
            typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
          ),
        ],
      );
      if (!s) throw new ApiError('REVISION_CONFLICT', 409);
      return s;
    });
  }
  async getPreferences(id: string, m?: EntityManager): Promise<any> {
    if (!m)
      return this.db.transaction('REPEATABLE READ', (manager) =>
        this.getPreferences(id, manager),
      );
    const [p] = await query(
      m,
      `SELECT revision FROM user_food_preferences WHERE user_id=$1`,
      [id],
    );
    return {
      revision: p.revision,
      allergen_codes: (
        await query(
          m,
          `SELECT allergen_code FROM user_allergies WHERE user_id=$1 ORDER BY allergen_code`,
          [id],
        )
      ).map((r: any) => r.allergen_code),
      disliked_food_ids: (
        await query(
          m,
          `SELECT food_id FROM user_food_exclusions WHERE user_id=$1 AND kind='DISLIKE' ORDER BY food_id`,
          [id],
        )
      ).map((r: any) => r.food_id),
      excluded_food_ids: (
        await query(
          m,
          `SELECT food_id FROM user_food_exclusions WHERE user_id=$1 AND kind='EXCLUSION' ORDER BY food_id`,
          [id],
        )
      ).map((r: any) => r.food_id),
    };
  }
  async putPreferences(id: string, input: z.infer<typeof dto.preferences>) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      const [p] = await query(
        m,
        `UPDATE user_food_preferences SET revision=revision+1 WHERE user_id=$1 AND revision=$2 RETURNING revision`,
        [id, input.expectedRevision],
      );
      if (!p) throw new ApiError('REVISION_CONFLICT', 409);
      for (const code of new Set(input.allergen_codes)) {
        const [a] = await query(m, `SELECT code FROM allergens WHERE code=$1`, [
          code,
        ]);
        if (!a) throw new ApiError('INVALID_ALLERGEN');
      }
      const all = [
        ...new Set([...input.disliked_food_ids, ...input.excluded_food_ids]),
      ];
      if (all.length) {
        const rows = await query(
          m,
          `SELECT id FROM food_reference_items WHERE id=ANY($1::uuid[])`,
          [all],
        );
        if (rows.length !== all.length)
          throw new ApiError('INVALID_FOOD_REFERENCE');
      }
      await query(m, `DELETE FROM user_allergies WHERE user_id=$1`, [id]);
      await query(m, `DELETE FROM user_food_exclusions WHERE user_id=$1`, [id]);
      for (const code of new Set(input.allergen_codes))
        await query(
          m,
          `INSERT INTO user_allergies(user_id,allergen_code) VALUES($1,$2)`,
          [id, code],
        );
      for (const [kind, ids] of [
        ['DISLIKE', input.disliked_food_ids],
        ['EXCLUSION', input.excluded_food_ids],
      ] as const)
        for (const food of new Set(ids))
          await query(
            m,
            `INSERT INTO user_food_exclusions(user_id,food_id,kind) VALUES($1,$2,$3)`,
            [id, food, kind],
          );
      await this.event(m, id, 'FOOD_PREFERENCES_UPDATED', p.revision);
      return this.getPreferences(id, m);
    });
  }
  async injuries(id: string, limit: number, offset: number) {
    return {
      items: await query(
        this.db,
        `SELECT * FROM user_injuries WHERE user_id=$1 AND status='ACTIVE' ORDER BY confirmed_at,id LIMIT $2 OFFSET $3`,
        [id, limit, offset],
      ),
      limit,
      offset,
    };
  }
  async bodyArea(m: EntityManager, code: string) {
    const [area] = await query(m, `SELECT code FROM body_areas WHERE code=$1`, [
      code,
    ]);
    if (!area) throw new ApiError('INVALID_BODY_AREA');
  }
  async injuryRevision(m: EntityManager, id: string) {
    const [s] = await query(
      m,
      `UPDATE user_restriction_states SET injury_revision=injury_revision+1 WHERE user_id=$1 RETURNING injury_revision`,
      [id],
    );
    await this.event(m, id, 'INJURIES_UPDATED', s.injury_revision);
    return s.injury_revision;
  }
  async addInjury(id: string, input: z.infer<typeof dto.injury>, key: string) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      const previous = await this.idempotency(m, id, 'injury', key, input);
      if (previous) {
        const [r] = await query(
          m,
          `SELECT * FROM user_injuries WHERE id=$1 AND user_id=$2`,
          [previous.resource_id, id],
        );
        return { injury: r, replayed: true };
      }
      await this.bodyArea(m, input.body_area_code);
      const [r] = await query(
        m,
        `INSERT INTO user_injuries(id,user_id,body_area_code,side,description) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [
          randomUUID(),
          id,
          input.body_area_code,
          input.side || null,
          input.description,
        ],
      );
      await this.recordKey(m, id, 'injury', key, input, r.id);
      return { injury: r, injury_revision: await this.injuryRevision(m, id) };
    });
  }
  async editInjury(
    id: string,
    injuryId: string,
    input: z.infer<typeof dto.injuryEdit>,
  ) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      await this.bodyArea(m, input.body_area_code);
      const [existing] = await query(
        m,
        `SELECT version,status FROM user_injuries WHERE id=$1 AND user_id=$2`,
        [injuryId, id],
      );
      if (!existing) throw new ApiError('NOT_FOUND', 404);
      if (
        existing.version !== input.expectedVersion ||
        existing.status !== 'ACTIVE'
      )
        throw new ApiError('REVISION_CONFLICT', 409);
      const [r] = await query(
        m,
        `UPDATE user_injuries SET body_area_code=$3,side=$4,description=$5,version=version+1,confirmed_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,
        [
          injuryId,
          id,
          input.body_area_code,
          input.side || null,
          input.description,
        ],
      );
      return { injury: r, injury_revision: await this.injuryRevision(m, id) };
    });
  }
  async removeInjury(id: string, injuryId: string, version: number) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id);
      const [r] = await query(
        m,
        `SELECT * FROM user_injuries WHERE id=$1 AND user_id=$2`,
        [injuryId, id],
      );
      if (!r) throw new ApiError('NOT_FOUND', 404);
      if (r.version !== version || r.status !== 'ACTIVE')
        throw new ApiError('REVISION_CONFLICT', 409);
      await query(
        m,
        `UPDATE user_injuries SET status='REMOVED',removed_at=now(),version=version+1 WHERE id=$1`,
        [injuryId],
      );
      return {
        status: 'REMOVED',
        version: version + 1,
        injury_revision: await this.injuryRevision(m, id),
      };
    });
  }
}
