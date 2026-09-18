import { describe, expect, it } from 'vitest';
import { dateRangeBounds, resolveTimeZone } from '../shared/date-range.js';

describe('dateRangeBounds', () => {
  it.each([
    ['Sep 1, 2026', 'Sep 30, 2026', 'Europe/Paris', '2026-08-31T22:00:00.000Z', '2026-09-30T21:59:59.999Z'],
    ['Sep 1, 2026', 'Sep 30, 2026', 'America/Los_Angeles', '2026-09-01T07:00:00.000Z', '2026-10-01T06:59:59.999Z'],
    ['Sep 1, 2026', 'Sep 30, 2026', 'America/New_York', '2026-09-01T04:00:00.000Z', '2026-10-01T03:59:59.999Z'],
    ['2026-09-01', '2026-09-30', 'UTC', '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
    ['2026-09-01', '2026-09-30', 'Asia/Kathmandu', '2026-08-31T18:15:00.000Z', '2026-09-30T18:14:59.999Z'],
    ['Mar 1, 2026', 'Mar 31, 2026', 'Europe/Paris', '2026-02-28T23:00:00.000Z', '2026-03-31T21:59:59.999Z'],
    ['Dec 31, 2026', 'Jan 1, 2027', 'Europe/Paris', '2026-12-30T23:00:00.000Z', '2027-01-01T22:59:59.999Z'],
  ])('resolves %s through %s in %s independently of the browser timezone', (from, to, zone, startISO, endISO) => {
    expect(dateRangeBounds(from, to, zone)).toMatchObject({ startISO, endISO });
  });

  it.each([
    ['Mar 29, 2026', 'Europe/Paris', '2026-03-28T23:00:00.000Z', 23],
    ['Oct 25, 2026', 'Europe/Paris', '2026-10-24T22:00:00.000Z', 25],
    ['Mar 8, 2026', 'America/Los_Angeles', '2026-03-08T08:00:00.000Z', 23],
    // DST skips midnight in Santiago and repeats midnight in Havana.
    ['Sep 6, 2026', 'America/Santiago', '2026-09-06T04:00:00.000Z', 23],
    ['Nov 1, 2026', 'America/Havana', '2026-11-01T04:00:00.000Z', 25],
  ])('includes all of the DST day %s in %s', (day, zone, startISO, hours) => {
    const bounds = dateRangeBounds(day, day, zone);
    expect(bounds.startISO).toBe(startISO);
    expect(Date.parse(bounds.endISO) - Date.parse(bounds.startISO) + 1).toBe(hours * 3_600_000);
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
