import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDashboardRange } from '../content/selectors.js';
import { createWeekendLookup } from '../content/weekend-lookup.js';
import { summarizeEntries } from '../shared/time-entries.js';

function showRange(label) {
  vi.stubGlobal('document', { querySelectorAll: () => label == null ? [] : [{ textContent: label }] });
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dashboard date range', () => {
  it('keeps a readable label separate from the timezone-specific lookup key', () => {
    showRange('  Sep 1, 2026  -  Sep 30, 2026  ');
    const range = getDashboardRange('Europe/Paris');
    expect(range.label).toBe('Sep 1, 2026 - Sep 30, 2026');
    expect(range.timeZone).toBe('Europe/Paris');
    expect(range.startISO).toBe('2026-08-31T22:00:00.000Z');
    expect(range.endISO).toBe('2026-09-30T21:59:59.999Z');
  });

  it.each([null, 'Loading', 'Loading - Loading', 'Sep 30, 2026 - Sep 1, 2026'])('returns unknown for %s', (label) => {
    showRange(label);
    expect(getDashboardRange('Europe/Paris')).toBeNull();
  });

  it('re-fetches after an account timezone change even when the label and total stay the same', async () => {
    vi.useFakeTimers();
    showRange('Jul 31, 2026 - Aug 1, 2026');
    const entries = [{
      timeInterval: { start: '2026-07-31T22:00:00Z', end: '2026-07-31T23:00:00Z', duration: 'PT1H' },
    }];
    const fetchSummary = vi.fn(async (range) => summarizeEntries(entries, range.timeZone));
    const lookup = createWeekendLookup({ fetchSummary });

    const paris = getDashboardRange('Europe/Paris');
    expect(lookup.get(paris, 1)).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(lookup.get(paris, 1)).toBe(1); // Saturday in Paris

    const utc = getDashboardRange('UTC');
    expect(lookup.get(utc, 1)).toBeNull(); // The Paris answer cannot be reused.
    await vi.advanceTimersByTimeAsync(0);
    expect(lookup.get(utc, 1)).toBe(0);   // Friday in UTC
    expect(fetchSummary).toHaveBeenCalledTimes(2);
  });
});
