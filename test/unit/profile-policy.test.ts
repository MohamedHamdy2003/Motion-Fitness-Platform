import { describe, it, expect } from 'vitest';
import { assertAgeEligible } from '../../src/modules/profiles/profile.policy';

describe('approved age policy: strictly older than 18', () => {
  const now = new Date('2026-10-31T10:00:00Z');
  it('rejects under 18 and the 18th birthday, accepts the next calendar day', () => {
    expect(() =>
      assertAgeEligible('2008-11-01', 'Africa/Cairo', now),
    ).toThrow();
    expect(() =>
      assertAgeEligible('2008-10-31', 'Africa/Cairo', now),
    ).toThrow();
    expect(() =>
      assertAgeEligible('2008-10-30', 'Africa/Cairo', now),
    ).not.toThrow();
  });
  it('uses the user timezone at the calendar-day boundary', () => {
    const boundary = new Date('2026-10-31T22:30:00Z');
    expect(() =>
      assertAgeEligible('2008-10-31', 'Africa/Cairo', boundary),
    ).not.toThrow();
    expect(() => assertAgeEligible('2008-10-31', 'UTC', boundary)).toThrow();
  });
  it('handles February 29 without treating February 28 as the anniversary', () => {
    expect(() =>
      assertAgeEligible('2008-02-29', 'UTC', new Date('2026-03-01T12:00:00Z')),
    ).toThrow();
    expect(() =>
      assertAgeEligible('2008-02-29', 'UTC', new Date('2026-03-02T12:00:00Z')),
    ).not.toThrow();
  });
});
