import { describe, it, expect } from 'vitest';
import { durationHours, dailyHours, summarizeEntries } from '../shared/time-entries.js';

const entry = (start, duration, end = start) => ({ timeInterval: { start, end, duration } });

describe('durationHours', () => {
  it('parses the ISO 8601 durations the API returns', () => {
    expect(durationHours('PT3H15M')).toBe(3.25);
    expect(durationHours('PT45M')).toBe(0.75);
    expect(durationHours('PT1H')).toBe(1);
    expect(durationHours('PT8H30M')).toBe(8.5);
    expect(durationHours('PT30S')).toBeCloseTo(1 / 120);
  });

  it('returns 0 rather than NaN on anything unexpected', () => {
    expect(durationHours('')).toBe(0);
    expect(durationHours(null)).toBe(0);
    expect(durationHours('PT')).toBe(0);
    expect(durationHours('3:15:00')).toBe(0);
  });
});

describe('dailyHours — timezone', () => {
  // Real payload from the live API: the 3:15 entry Clockify shows on Sat 1 Aug.
  // Its UTC start is Friday 31 July. Bucketing it in UTC silently drops the
  // weekend bonus, which is exactly the bug this guards.
  const REAL = [entry('2026-07-31T22:00:00Z', 'PT3H15M', '2026-08-01T01:15:00Z')];

  it('buckets by the user timezone, not UTC', () => {
    expect(dailyHours(REAL, 'Europe/Paris')).toEqual([{ date: '2026-08-01', hours: 3.25 }]);
    expect(dailyHours(REAL, 'UTC')).toEqual([{ date: '2026-07-31', hours: 3.25 }]);
  });

  it('makes the difference between a weekend bonus and none', () => {
    expect(summarizeEntries(REAL, 'Europe/Paris').weekendHours).toBe(3.25);   // Saturday
    expect(summarizeEntries(REAL, 'UTC').weekendHours).toBe(0);               // Friday
  });

  it('falls back to the runtime zone on a bogus timezone instead of throwing', () => {
    expect(() => dailyHours(REAL, 'Not/AZone')).not.toThrow();
    expect(dailyHours(REAL, 'Not/AZone')).toHaveLength(1);
  });
});

describe('dailyHours — aggregation', () => {
  const ENTRIES = [
    entry('2026-08-01T08:00:00Z', 'PT2H'),      // Sat
    entry('2026-08-01T14:00:00Z', 'PT1H15M'),   // Sat, same day
    entry('2026-08-02T09:00:00Z', 'PT4H'),      // Sun
    entry('2026-08-03T09:00:00Z', 'PT8H'),      // Mon
  ];

  it('sums entries per day and sorts ascending', () => {
    expect(dailyHours(ENTRIES, 'UTC')).toEqual([
      { date: '2026-08-01', hours: 3.25 },
      { date: '2026-08-02', hours: 4 },
      { date: '2026-08-03', hours: 8 },
    ]);
  });

  it('splits weekend from weekday hours', () => {
    const s = summarizeEntries(ENTRIES, 'UTC');
    expect(s.totalHours).toBe(15.25);
    expect(s.weekendHours).toBe(7.25);     // Sat 3.25 + Sun 4
    expect(s.days).toHaveLength(3);
  });

  it('ignores entries with no usable duration', () => {
    expect(dailyHours([entry('2026-08-01T08:00:00Z', 'PT0S')], 'UTC')).toEqual([]);
    expect(dailyHours([{ timeInterval: {} }], 'UTC')).toEqual([]);
    expect(dailyHours([null, undefined], 'UTC')).toEqual([]);
    expect(dailyHours()).toEqual([]);
  });

  it('counts a still-running entry as elapsed time', () => {
    const running = { timeInterval: { start: '2026-08-01T08:00:00Z', end: null, duration: null } };
    const now = Date.parse('2026-08-01T10:30:00Z');
    expect(dailyHours([running], 'UTC', now)).toEqual([{ date: '2026-08-01', hours: 2.5 }]);
  });

  it('does not count a running entry whose start is in the future', () => {
    const future = { timeInterval: { start: '2026-08-02T08:00:00Z', end: null, duration: null } };
    expect(dailyHours([future], 'UTC', Date.parse('2026-08-01T10:00:00Z'))).toEqual([]);
  });
});
