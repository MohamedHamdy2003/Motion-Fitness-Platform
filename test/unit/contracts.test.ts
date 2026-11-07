import { describe, it, expect } from 'vitest';
import { parse, ApiError } from '../../src/common/http';
import {
  profilePatch,
  onboarding,
  injury,
  timezone,
} from '../../src/modules/profiles/profile.dto';
import { encrypt, decrypt } from '../../src/common/crypto';
describe('mobile contracts', () => {
  it('accepts lookup-code shapes and requires a gender during onboarding', () => {
    const body = {
      name: 'Athlete',
      gender: 'FEMALE',
      height_cm: 170,
      weight_kg: 70,
      target_weight_kg: 65,
      primary_goal: 'FAT_LOSS',
      fitness_level: 'BEGINNER',
      training_days_per_week: ['SUNDAY', 'TUESDAY'],
      timezone: 'Africa/Cairo',
      locale: 'ar',
      date_of_birth: '1998-03-14',
      food_preferences: {
        allergen_codes: [],
        disliked_food_ids: [],
      },
    };
    expect(onboarding.safeParse(body).success).toBe(true);
    expect(onboarding.safeParse({ ...body, expectedRevision: 0 }).success).toBe(
      false,
    );
    expect(
      onboarding.safeParse({
        ...body,
        food_preferences: {
          ...body.food_preferences,
          excluded_food_ids: [],
        },
      }).success,
    ).toBe(false);
    const dynamicValue = onboarding.safeParse({ ...body, gender: 'unknown' });
    expect(dynamicValue.success).toBe(true);
    if (dynamicValue.success) expect(dynamicValue.data.gender).toBe('UNKNOWN');
    expect(onboarding.safeParse({ ...body, gender: undefined }).success).toBe(
      false,
    );
  });
  it('rejects invalid profile structure and unexpected fields', () => {
    for (const patch of [
      { training_days_per_week: ['SUNDAY'] },
      { training_days_per_week: ['SUNDAY', 'SUNDAY'] },
      { target_weight_kg: 0 },
      { role: 'ADMIN' },
    ])
      expect(() => parse(profilePatch, { ...patch })).toThrow(ApiError);
  });
  it('requires actual calendar date, timezone and positive measurements', () => {
    expect(timezone.safeParse('Africa/Cairo').success).toBe(true);
    expect(timezone.safeParse('Invented/Zone').success).toBe(false);
    expect(
      profilePatch.safeParse({
        date_of_birth: '2001-02-30',
      }).success,
    ).toBe(false);
    expect(
      profilePatch.safeParse({
        weight_kg: 0,
      }).success,
    ).toBe(false);
  });
  it('rejects empty edits and removed measurement fields', () => {
    expect(
      profilePatch.safeParse({
        measured_at: '2020-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      profilePatch.safeParse({
        weight_kg: 80,
        body_fat_percent: 20,
        body_fat_method: 'BIA',
        measured_at: '2020-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
  it('requires explicit final injury confirmation', () => {
    expect(
      injury.safeParse({ description: 'pain', body_area_code: 'KNEE' }).success,
    ).toBe(false);
  });
  it('encrypts captured email with authenticated encryption', () => {
    const key = 'a'.repeat(64);
    const encoded = encrypt('private reset token', key);
    expect(encoded).not.toContain('private');
    expect(decrypt(encoded, key)).toBe('private reset token');
    expect(() => decrypt(encoded, 'b'.repeat(64))).toThrow();
  });
});
