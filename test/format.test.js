import { describe, it, expect } from 'vitest';
import {
  parseTime, formatHM, fmt, fmtPct, fmtFr, parseFr, fmtDate, addDays,
} from '../shared/format.js';

describe('parseTime', () => {
  it('parses H:MM:SS', () => expect(parseTime('07:30:00')).toBe(7.5));
  it('parses H:MM', () => expect(parseTime('1:30')).toBe(1.5));
  it('parses seconds', () => expect(parseTime('0:00:36')).toBeCloseTo(0.01));
  it('returns 0 for junk or empty input', () => {
    expect(parseTime('')).toBe(0);
    expect(parseTime(undefined)).toBe(0);
    expect(parseTime('abc')).toBe(0);
  });
});

describe('formatHM', () => {
  it('matches Clockify-style day totals', () => {
    expect(formatHM(7.5)).toBe('7:30');
    expect(formatHM(0)).toBe('0:00');
  });
  it('rounds to the nearest minute', () => expect(formatHM(1.999)).toBe('2:00'));
});

describe('fmt', () => {
  it('falls back to "amount CODE" for unknown currency codes', () => {
    expect(fmt(5, 'NOPE')).toBe('5.00 NOPE');
  });
});

describe('fmtPct', () => {
  it('drops the decimal for whole numbers', () => expect(fmtPct(22)).toBe('22%'));
  it('keeps one decimal otherwise', () => expect(fmtPct(2.2)).toBe('2.2%'));
});

describe('French number formatting', () => {
  it('formats with space thousands and comma decimals', () => {
    expect(fmtFr(12345.678)).toBe('12 345,68');
    expect(fmtFr(1.5, 6)).toBe('1,500000');
  });
  it('round-trips through parseFr', () => {
    expect(parseFr('12 345,68')).toBeCloseTo(12345.68);
    expect(parseFr('')).toBe(0);
  });
});

describe('dates', () => {
  it('renders ISO as DD/MM/YYYY', () => expect(fmtDate('2026-06-11')).toBe('11/06/2026'));
  it('adds days across month ends, independent of timezone', () => {
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
    expect(addDays('2026-06-11', 30)).toBe('2026-07-11');
  });
});
