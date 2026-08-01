import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isoWeekday, isWeekendISO, isWeekendDay, weekdayFromLabel, isWeekendLabel,
  buildWeekdayTable, summarizeWeekend,
} from '../shared/weekday.js';

// Locales are always passed explicitly so results never depend on the machine's
// navigator.language.

afterEach(() => { vi.useRealTimers(); });

describe('isoWeekday', () => {
  it('resolves ISO dates in UTC', () => {
    expect(isoWeekday('2026-08-01')).toBe(6);   // Saturday — the dashboard screenshot
    expect(isoWeekday('2026-08-03')).toBe(1);
    expect(isWeekendISO('2026-08-02')).toBe(true);   // Sunday
    expect(isWeekendISO('2026-08-04')).toBe(false);
  });

  it('returns null for anything that is not an ISO date', () => {
    expect(isoWeekday('Sat, Aug 1')).toBeNull();
    expect(isoWeekday('')).toBeNull();
    expect(isoWeekday(undefined)).toBeNull();
    expect(isoWeekday('2026-13-99')).toBeNull();
  });
});

describe('weekdayFromLabel', () => {
  it('reads the English labels Clockify renders', () => {
    expect(weekdayFromLabel('Sat, Aug 1',  ['en-US'])).toBe(6);
    expect(weekdayFromLabel('Sun, Aug 16', ['en-US'])).toBe(0);
    expect(weekdayFromLabel('Fri, 01 Aug', ['en-US'])).toBe(5);
    expect(weekdayFromLabel('Monday',      ['en-US'])).toBe(1);
  });

  it('reads French labels, abbreviated and full', () => {
    expect(weekdayFromLabel('sam. 1 août',   ['fr-FR'])).toBe(6);
    expect(weekdayFromLabel('dimanche 2 août', ['fr-FR'])).toBe(0);
    expect(weekdayFromLabel('mer. 29 juil.', ['fr-FR'])).toBe(3);
  });

  it('prefers an embedded ISO date over label text', () => {
    expect(weekdayFromLabel('2026-08-01', ['en-US'])).toBe(6);
  });

  it('resolves relative labels against the current date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 12));            // local Saturday
    expect(weekdayFromLabel('Today',     ['en-US'])).toBe(6);
    expect(weekdayFromLabel('Yesterday', ['en-US'])).toBe(5);
    expect(weekdayFromLabel('aujourd’hui', ['fr-FR'])).toBe(6);   // curly apostrophe
    expect(weekdayFromLabel('hier',        ['fr-FR'])).toBe(5);
  });

  it('returns null rather than guessing on unrecognised text', () => {
    expect(weekdayFromLabel('Total: 3:15:00', ['en-US'])).toBeNull();
    expect(weekdayFromLabel('',      ['en-US'])).toBeNull();
    expect(weekdayFromLabel(null,    ['en-US'])).toBeNull();
    expect(weekdayFromLabel('12345', ['en-US'])).toBeNull();
  });

  it('never reports a weekend for a label it could not read', () => {
    expect(isWeekendLabel('Total: 3:15:00', ['en-US'])).toBe(false);
    expect(isWeekendLabel('Mon, Aug 10',    ['en-US'])).toBe(false);
    expect(isWeekendLabel('Sat, Aug 1',     ['en-US'])).toBe(true);
  });
});

describe('buildWeekdayTable', () => {
  const MANY = ['en-US', 'fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-BR'];

  it('neutralises tokens that mean different days across the locale set', () => {
    for (const [token, index] of buildWeekdayTable(MANY)) {
      if (index === -1) expect(weekdayFromLabel(token, MANY)).toBeNull();
    }
  });

  it('survives a bogus locale tag', () => {
    expect(() => buildWeekdayTable(['zz-ZZ-nope', 'en-US'])).not.toThrow();
    expect(weekdayFromLabel('Sat', ['zz-ZZ-nope', 'en-US'])).toBe(6);
  });
});

describe('summarizeWeekend', () => {
  const days = [
    { hours: 8, weekday: 5 }, { hours: 4, weekday: 6 },
    { hours: 2, weekday: 0 }, { hours: 3, weekday: 1 },
  ];

  it('sums Saturday and Sunday only', () => {
    expect(summarizeWeekend(days)).toMatchObject({ weekendHours: 6, totalHours: 17, complete: true });
  });

  it('reports unclassifiable days instead of counting them', () => {
    const r = summarizeWeekend([...days, { hours: 5, weekday: null }]);
    expect(r.weekendHours).toBe(6);          // unchanged — never guessed upward
    expect(r).toMatchObject({ unknownHours: 5, unknownDays: 1, complete: false });
  });

  it('handles an empty list', () => {
    expect(summarizeWeekend()).toMatchObject({ weekendHours: 0, totalHours: 0, complete: true });
  });
});

describe('isWeekendDay', () => {
  it('is true only for Saturday and Sunday', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(isWeekendDay))
      .toEqual([true, false, false, false, false, false, true]);
    expect(isWeekendDay(null)).toBe(false);
    expect(isWeekendDay(undefined)).toBe(false);
  });
});
