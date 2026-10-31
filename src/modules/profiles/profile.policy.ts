import { ApiError } from '../../common/http';

export const minimumAge = 18;

/** Date-of-birth precision: eligible from the day after the 18th birthday. */
export function assertAgeEligible(
  birth: string,
  timezone: string,
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  const today = `${value('year')}-${value('month')}-${value('day')}`;
  const [year, month, day] = birth.split('-').map(Number);
  const anniversaryYear = year + minimumAge;
  // A February 29 birthday reaches its anniversary on March 1 in a non-leap year.
  const anniversary = new Date(Date.UTC(anniversaryYear, month - 1, day))
    .toISOString()
    .slice(0, 10);
  if (anniversary >= today) throw new ApiError('AGE_NOT_ELIGIBLE', 422);
}
