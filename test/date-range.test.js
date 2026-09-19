import { describe, expect, it } from 'vitest';
import { dateRangeBounds, resolveTimeZone } from '../shared/date-range.js';

describe('dateRangeBounds', () => {
  it.each([
    ['Sep 1, 2026', 'Sep 30, 2026', 'Europe/Paris', '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
    ['Sep 1, 2026', 'Sep 30, 2026', 'America/Los_Angeles', '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
    ['Sep 1, 2026', 'Sep 30, 2026', 'America/New_York', '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
    ['2026-09-01', '2026-09-30', 'UTC', '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
    ['2026-09-01', '2026-09-30', 'Asia/Kathmandu', '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
    ['Mar 1, 2026', 'Mar 31, 2026', 'Europe/Paris', '2026-03-01T00:00:00.000Z', '2026-03-31T23:59:59.999Z'],
    ['Dec 31, 2026', 'Jan 1, 2027', 'Europe/Paris', '2026-12-31T00:00:00.000Z', '2027-01-01T23:59:59.999Z'],
  ])('preserves local API dates %s through %s in %s', (from, to, zone, apiStart, apiEnd) => {
    expect(dateRangeBounds(from, to, zone)).toEqual({ apiStart, apiEnd, timeZone: resolveTimeZone(zone) });
  });

  it.each([
    ['Mar 29, 2026', 'Europe/Paris', '2026-03-29'],
    ['Oct 25, 2026', 'Europe/Paris', '2026-10-25'],
    ['Mar 8, 2026', 'America/Los_Angeles', '2026-03-08'],
    // DST skips midnight in Santiago and repeats midnight in Havana.
    ['Sep 6, 2026', 'America/Santiago', '2026-09-06'],
    ['Nov 1, 2026', 'America/Havana', '2026-11-01'],
  ])('asks Clockify for the full local DST day %s in %s', (day, zone, date) => {
    const bounds = dateRangeBounds(day, day, zone);
    expect(bounds.apiStart).toBe(`${date}T00:00:00.000Z`);
    expect(bounds.apiEnd).toBe(`${date}T23:59:59.999Z`);
  });

  it('rejects unreadable or reversed ranges', () => {
    expect(dateRangeBounds('Loading', 'Sep 30, 2026', 'Europe/Paris')).toBeNull();
    expect(dateRangeBounds('Sep 1, 2026', '', 'Europe/Paris')).toBeNull();
    expect(dateRangeBounds('Sep 30, 2026', 'Sep 1, 2026', 'Europe/Paris')).toBeNull();
  });

  it.each([undefined, 'Not/AZone'])('uses one explicit browser timezone when the account zone is %s', (zone) => {
    const browserZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveTimeZone(zone)).toBe(browserZone);
    expect(dateRangeBounds('Sep 1, 2026', 'Sep 30, 2026', zone))
      .toEqual(dateRangeBounds('Sep 1, 2026', 'Sep 30, 2026', browserZone));
  });
});
