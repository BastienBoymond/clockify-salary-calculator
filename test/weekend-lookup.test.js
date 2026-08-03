import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWeekendLookup } from '../content/weekend-lookup.js';

// Ranges exactly as selectors.js getDashboardRange() hands them over.
const AUG = { key: 'Aug 1, 2026 - Aug 31, 2026', startISO: '2026-08-01T00:00:00.000Z', endISO: '2026-08-31T23:59:59.999Z' };
const JUL = { key: 'Jul 1, 2026 - Jul 31, 2026', startISO: '2026-07-01T00:00:00.000Z', endISO: '2026-07-31T23:59:59.999Z' };

// A hand-resolved fetch, so overlapping requests and out-of-order landings — the
// shape of the bug this module replaces — are expressible.
function fetchSpy() {
  const pending = [];
  const fn = vi.fn((range) => new Promise((resolve, reject) => {
    pending.push({ key: range.key, resolve, reject });
  }));
  fn.pending = pending;
  // Newest first: a timed-out attempt leaves its promise pending forever, so
  // "the request for this key" means the most recent one.
  fn.take = (key) => {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].key === key) return pending.splice(i, 1)[0];
    }
    throw new Error(`no request pending for ${key}`);
  };
  return fn;
}

function harness() {
  const fetchSummary = fetchSpy();
  const onChange = vi.fn();
  const warn     = vi.fn();
  const lookup   = createWeekendLookup({ fetchSummary, onChange, warn });

  // advanceTimersByTimeAsync(0) drains the microtask queue the settle path uses.
  const flush = () => vi.advanceTimersByTimeAsync(0);

  return {
    lookup, fetchSummary, onChange, warn, pending: fetchSummary.pending,
    calls:   () => fetchSummary.mock.calls.length,
    succeed: async (key, totalHours, weekendHours) => {
      fetchSummary.take(key).resolve({ totalHours, weekendHours });
      await flush();
    },
    fail: async (key, message = 'Clockify API 401') => {
      fetchSummary.take(key).reject(new Error(message));
      await flush();
    },
    // What the MutationObserver does: call get() over and over.
    poll: (times, range = AUG, pageHours = 8) => {
      for (let i = 0; i < times; i++) lookup.get(range, pageHours);
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('recovering from a failed lookup', () => {
  // The reported bug: the bonus goes missing after navigating calendar →
  // dashboard and only a page reload brings it back. The old code cached the
  // failure as a permanent answer, so nothing ever asked again.
  it('retries a transient failure after the backoff and then succeeds', async () => {
    const h = harness();

    expect(h.lookup.get(AUG, 8)).toBeNull();
    await h.fail(AUG.key);
    expect(h.lookup.get(AUG, 8)).toBeNull();

    await vi.advanceTimersByTimeAsync(1499);
    expect(h.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.calls()).toBe(2);

    await h.succeed(AUG.key, 8, 3);
    expect(h.lookup.get(AUG, 8)).toBe(3);
    expect(h.onChange).toHaveBeenCalledTimes(1);
  });

  // getSession() returns null for a few hundred ms while Clockify refreshes its
  // token mid-navigation, and it throws synchronously rather than rejecting.
  it('treats a synchronous throw as a retryable failure, not a crash', async () => {
    let ok = false;
    const fetchSummary = vi.fn(() => {
      if (!ok) throw new Error('no Clockify session');
      return Promise.resolve({ totalHours: 8, weekendHours: 3 });
    });
    const lookup = createWeekendLookup({ fetchSummary, warn: () => {} });

    expect(lookup.get(AUG, 8)).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(lookup.get(AUG, 8)).toBeNull();

    ok = true;
    await vi.advanceTimersByTimeAsync(1500);
    expect(lookup.get(AUG, 8)).toBe(3);
  });

  it('retries a request that never answers instead of waiting forever', async () => {
    // fetchTimeEntries has no timeout, and a pending request blocks every later
    // attempt — the same symptom as the bug, with nothing logged.
    const h = harness();

    h.lookup.get(AUG, 8);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(h.calls()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);        // deadline
    await vi.advanceTimersByTimeAsync(1500);     // then the usual backoff
    expect(h.calls()).toBe(2);

    await h.succeed(AUG.key, 8, 3);
    expect(h.lookup.get(AUG, 8)).toBe(3);
  });

  it('ignores a reply that arrives after its deadline', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await vi.advanceTimersByTimeAsync(30_000);   // attempt 1 timed out
    await h.succeed(AUG.key, 8, 3);              // the stalled reply finally lands

    expect(h.onChange).not.toHaveBeenCalled();
    expect(h.lookup.get(AUG, 8)).toBeNull();
  });

  it('re-attempts on invalidate() once the budget is spent', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(1500);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(6000);
    await h.fail(AUG.key);
    expect(h.calls()).toBe(3);

    // Arriving on the dashboard again is the retry gesture F5 used to be.
    h.lookup.invalidate();
    expect(h.lookup.get(AUG, 8)).toBeNull();
    expect(h.calls()).toBe(4);

    await h.succeed(AUG.key, 8, 3);
    expect(h.lookup.get(AUG, 8)).toBe(3);
  });

  it('re-fetches a range it already knows after invalidate()', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);
    expect(h.lookup.get(AUG, 8)).toBe(3);

    h.lookup.invalidate();
    expect(h.lookup.get(AUG, 8)).toBeNull();   // no stale number survives a visit
    expect(h.calls()).toBe(2);
  });
});

describe('retryFailures — a re-attempt that costs nothing when healthy', () => {
  // Wired to settings changes and to a tab becoming visible: welcome to retry a
  // failure, never worth re-downloading a range we already proved.
  it('keeps a proven answer and issues no request', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    h.lookup.retryFailures();
    expect(h.lookup.get(AUG, 8)).toBe(3);
    expect(h.calls()).toBe(1);
  });

  it('re-attempts a lookup that spent its budget', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(1500);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(6000);
    await h.fail(AUG.key);
    expect(h.calls()).toBe(3);

    h.lookup.retryFailures();
    expect(h.lookup.get(AUG, 8)).toBeNull();
    expect(h.calls()).toBe(4);

    await h.succeed(AUG.key, 8, 3);
    expect(h.lookup.get(AUG, 8)).toBe(3);
  });

  it('leaves an in-flight request alone rather than duplicating it', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    h.lookup.retryFailures();
    h.lookup.get(AUG, 8);

    expect(h.calls()).toBe(1);
    await h.succeed(AUG.key, 8, 3);
    expect(h.lookup.get(AUG, 8)).toBe(3);
  });

  it('says once, out loud, why it gave up', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await h.fail(AUG.key, 'Clockify API 429');
    await vi.advanceTimersByTimeAsync(1500);
    await h.fail(AUG.key, 'Clockify API 429');
    expect(h.warn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6000);
    await h.fail(AUG.key, 'Clockify API 429');
    h.poll(50);

    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn.mock.calls[0][0]).toContain('Clockify API 429');
    expect(h.warn.mock.calls[0][0]).toContain(AUG.key);
  });
});

describe('stale and out-of-order replies', () => {
  // The old single-slot cache let whichever reply landed last win, whatever
  // range it was for. The range key genuinely churns during a route change.
  it('cannot let an older reply overwrite the range on screen', async () => {
    const h = harness();

    h.lookup.get(JUL, 5);   // transitional range, request in flight
    h.lookup.get(AUG, 8);   // the range that settled
    expect(h.calls()).toBe(2);

    await h.succeed(AUG.key, 8, 3);
    await h.succeed(JUL.key, 5, 2);   // lands last, but is not what's on screen

    expect(h.lookup.get(AUG, 8)).toBe(3);
    expect(h.calls()).toBe(2);        // and no third request to repair it
  });

  // Deciding inside settle() that nobody is looking at a range is how a correct
  // answer ends up cached but never displayed: re-rendering is driven by the DOM
  // signature, and a settled dashboard produces no further mutation to retry on.
  it('re-renders whenever an answer lands, even for a range polled earlier', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    h.lookup.get(JUL, 5);   // a transient range key sampled after AUG
    await h.succeed(AUG.key, 8, 3);

    expect(h.onChange).toHaveBeenCalledTimes(1);
    expect(h.lookup.get(AUG, 8)).toBe(3);
  });

  it('ignores a reply that lands after invalidate()', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    h.lookup.invalidate();
    await h.succeed(AUG.key, 8, 3);

    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('does not start a second fetch when onChange calls get() again', async () => {
    // Mirrors main.js, where onChange runs evaluateAndInject() → get().
    const h = harness({ onChange: undefined });
    const lookup = createWeekendLookup({
      fetchSummary: h.fetchSummary,
      onChange: () => lookup.get(AUG, 8),
      warn: h.warn,
    });

    lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    expect(h.calls()).toBe(1);
    expect(lookup.get(AUG, 8)).toBe(3);
  });
});

describe('a broken session cannot become a fetch storm', () => {
  it('costs one fetch however often it is polled', () => {
    const h = harness();
    for (let i = 0; i < 200; i++) expect(h.lookup.get(AUG, 8)).toBeNull();
    expect(h.calls()).toBe(1);
  });

  it('costs one fetch per range key while they churn', () => {
    const h = harness();
    for (let i = 0; i < 200; i++) {
      h.lookup.get(i % 2 ? AUG : JUL, 8);
    }
    expect(h.calls()).toBe(2);
  });

  it('spends three attempts on a range and then goes quiet', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(1500);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(6000);
    await h.fail(AUG.key);

    h.poll(500);
    await vi.advanceTimersByTimeAsync(60_000);
    h.poll(500);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(h.calls()).toBe(3);
    expect(h.lookup.get(AUG, 8)).toBeNull();
  });
});

describe('an unknown answer is null, never 0', () => {
  // A silent 0 on the card is money never billed.
  it('is null while in flight, after a failure, and once spent', async () => {
    const h = harness();

    expect(h.lookup.get(AUG, 8)).toBeNull();

    await h.fail(AUG.key);
    expect(h.lookup.get(AUG, 8)).toBeNull();

    await vi.advanceTimersByTimeAsync(1500);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(6000);
    await h.fail(AUG.key);

    expect(h.lookup.get(AUG, 8)).toBeNull();
  });

  it('is null for a range that cannot be scraped yet', () => {
    const h = harness();
    expect(h.lookup.get(null, 8)).toBeNull();
    expect(h.lookup.get({}, 8)).toBeNull();
    expect(h.lookup.get({ key: '' }, 8)).toBeNull();
    expect(h.calls()).toBe(0);
  });

  it('reports a real zero as zero', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 0);   // a month with no weekend work
    expect(h.lookup.get(AUG, 8)).toBe(0);
  });

  it('treats a non-numeric API total as a failure rather than showing NaN', async () => {
    const h = harness();

    h.lookup.get(AUG, 8);
    // Math.abs(NaN - 8) >= 1/60 is false, so without the finite guard NaN would
    // pass the cross-check and reach the card as "+NaN h weekend".
    await h.succeed(AUG.key, NaN, NaN);
    expect(h.lookup.get(AUG, 8)).toBeNull();

    await vi.advanceTimersByTimeAsync(1500);
    expect(h.calls()).toBe(2);
  });
});

describe('the total-agreement cross-check', () => {
  it('withholds the number when the page total disagrees', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    const wrongWindow = h.lookup.get(AUG, 5);
    expect(wrongWindow).toBeNull();
    expect(wrongWindow).not.toBe(0);
  });

  it('tolerates the second-rounding Clockify prints, but not a real gap', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    expect(h.lookup.get(AUG, 8 - 0.5 / 60)).toBe(3);
    expect(h.lookup.get(AUG, 8 - 2 / 60)).toBeNull();
  });

  it('withholds the number when there is no page total to check against', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    expect(h.lookup.get(AUG, NaN)).toBeNull();   // parseTime('--:--:--')
  });

  // parseTime('') is 0, not NaN, so a total Clockify has mounted but not filled
  // in arrives here as a plausible-looking zero. Scoring that as a real
  // disagreement spent the retry budget on a total that had simply not rendered,
  // and then latched: the genuine total could never be served afterwards.
  it('treats an unrendered total as unknown, not as a disagreement', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    h.poll(50, AUG, 0);                          // total blank for a while
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls()).toBe(1);                   // no attempts burned
    expect(h.warn).not.toHaveBeenCalled();       // and no misdiagnosis logged

    expect(h.lookup.get(AUG, 0)).toBeNull();     // withheld while unproven
    expect(h.lookup.get(AUG, 8)).toBe(3);        // served the moment it renders
  });

  // An entry edited on the calendar leaves the range key identical but moves the
  // total, which the old code turned into another permanent "unknown".
  it('re-fetches when the page total moves under a cached answer', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    expect(h.lookup.get(AUG, 11)).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.calls()).toBe(2);

    await h.succeed(AUG.key, 11, 6);
    expect(h.lookup.get(AUG, 11)).toBe(6);
  });

  it('spends nothing on a disagreement that was only a mid-render total', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    expect(h.lookup.get(AUG, 0)).toBeNull();   // "0:00:00" while Clockify aggregates
    expect(h.lookup.get(AUG, 8)).toBe(3);      // settled before the timer fired

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls()).toBe(1);
  });

  // A 401 says nothing about a figure we already cross-checked. Throwing it away
  // meant one blip during a re-check cost the bonus for the rest of the visit.
  it('keeps a proven answer through a failed re-check', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    // The page total blips — an entry edited in another tab, or a filter applied.
    expect(h.lookup.get(AUG, 11)).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    await h.fail(AUG.key);
    await vi.advanceTimersByTimeAsync(6000);
    await h.fail(AUG.key);

    // Total settles back to the value we proved: the answer is still good.
    expect(h.lookup.get(AUG, 8)).toBe(3);
  });

  it('gives up boundedly on a total that can never agree', async () => {
    const h = harness();
    h.lookup.get(AUG, 8);
    await h.succeed(AUG.key, 8, 3);

    // A dashboard filtered to one project: its printed total can never match an
    // unfiltered API total.
    for (let i = 0; i < 5; i++) {
      h.poll(20, AUG, 3);
      await vi.advanceTimersByTimeAsync(2000);
      if (h.pending.length) await h.succeed(AUG.key, 8, 3);
    }

    expect(h.calls()).toBe(3);
    expect(h.lookup.get(AUG, 3)).toBeNull();
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn.mock.calls[0][0]).toContain('disagrees');
  });
});
