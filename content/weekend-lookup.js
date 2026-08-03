// "How many of the hours in the range the dashboard is showing fell on a
// weekend?" — the whole state machine behind that one question: cache, in-flight
// tracking, staleness rejection, bounded retry, invalidation.
//
// The dashboard's daily chart is a <canvas>, so the answer can only come from
// the Clockify API (see clockify-api.js). main.js scrapes the range and renders;
// deciding *when* to ask lives here.
//
// Three invariants this file exists to hold:
//
//  1. A broken session can't turn every DOM mutation into a fetch. get() is
//     polled from a MutationObserver that fires on nearly every frame Clockify
//     renders. A request starts from get() only the first time a range key is
//     seen; every later attempt is timer-driven, and attempts are capped.
//
//  2. A silent 0 is money never billed. An unknown answer is null — in flight,
//     after a failure, once the attempt budget is spent, and whenever the answer
//     cannot be cross-checked. Never 0.
//
//  3. The total-agreement cross-check is the proof we fetched the window the
//     page is showing: the API's totalHours must match the total the dashboard
//     itself prints, to within a minute. No proof, no number.
//
// What this replaces: a single-slot cache that stored a failed fetch as a
// permanent answer — only a page reload cleared it — and let the last reply to
// land win regardless of which range it was for.
//
// No DOM, no chrome.*, no globals: clock, timers and the fetch are injected, so
// this runs under plain vitest with fake timers.

// Delay before each retry, indexed by attempts already spent. Three attempts,
// ~7.5s: 1.5s clears the dominant transient — Clockify refreshing its token
// mid-route-change, which makes getSession() come back empty for a few hundred
// ms — and still reads as loading rather than as a bug; 6s clears a rate-limit
// window with margin. Past that a failure is structural (logged out, revoked
// token, a total that can never agree), and an honest "weekend bonus not
// included" beats a fetch loop on a tab left open all afternoon.
const BACKOFF_MS = [1500, 6000];

// Clockify prints its totals rounded to the second; one minute of slack, the
// same tolerance selectors.js uses for the tracker completeness proof.
const TOTAL_TOLERANCE_H = 1 / 60;

// fetchTimeEntries awaits up to 20 sequential pages with no timeout of its own,
// so a stalled connection could leave a request pending forever — and a pending
// request blocks every later attempt, which is indistinguishable from the bug
// this module exists to fix, with no warning logged. Generous enough for a big
// multi-page range on a slow link, short enough that the retries still matter.
const REQUEST_TIMEOUT_MS = 30_000;

export function createWeekendLookup({
  fetchSummary,                  // (range) => Promise<{ totalHours, weekendHours }>, throws when unknown
  onChange = () => {},           // an answer landed; re-render
  // Late-bound by default so fake timers can replace them.
  setTimer   = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  warn       = (message) => console.warn(message),
  backoffMs  = BACKOFF_MS,
  tolerance  = TOTAL_TOLERANCE_H,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const maxAttempts = backoffMs.length + 1;

  // range key -> {
  //   range,                      // freshest scrape for this key
  //   totalHours, weekendHours,   // null until a fetch succeeds
  //   pageHours,                  // last usable total the page printed
  //   attempts,                   // requests spent on this key
  //   inflight, timer, warned,
  // }
  //
  // Keyed rather than a single slot: a reply can only ever write the entry it
  // was issued for, so one range's answer cannot overwrite another's. An entry
  // dropped from the map while its request is in flight is thereby orphaned —
  // which is how invalidate() cancels work it no longer wants.
  const cache = new Map();

  const disagrees = (entry) =>
    entry.totalHours !== null &&
    entry.pageHours  !== null &&
    Math.abs(entry.totalHours - entry.pageHours) >= tolerance;

  // Said once per range key. This failure mode is intermittent and timing
  // dependent, so naming the actual reason is what makes the next report
  // diagnosable instead of "the bonus is sometimes missing". Callers check
  // entry.warned first, so the message is never built twice.
  function giveUp(entry, reason) {
    entry.warned = true;
    warn(`[clockify-salary] weekend hours unavailable for ${entry.range.key}: ${reason}`);
  }

  function entryFor(range) {
    const found = cache.get(range.key);
    if (found) {
      found.range = range;   // same key, freshly scraped ISO bounds
      return found;
    }

    const entry = {
      range, totalHours: null, weekendHours: null, pageHours: null,
      attempts: 0, inflight: false, timer: null, warned: false,
    };
    cache.set(range.key, entry);
    return entry;
  }

  // One timer per entry, so the mutations arriving meanwhile coalesce onto the
  // attempt already scheduled instead of each starting their own.
  function schedule(entry, delayMs, guard) {
    if (entry.inflight || entry.timer !== null || entry.attempts >= maxAttempts) return;

    entry.timer = setTimer(() => {
      entry.timer = null;
      if (guard && !guard(entry)) return;   // the reason to fetch went away
      start(entry);
    }, delayMs);
  }

  function start(entry) {
    entry.inflight  = true;
    entry.attempts += 1;
    const key = entry.range.key;

    // Whichever of the reply and the deadline arrives first settles the attempt;
    // the loser is ignored. `deadline` is declared before the callback that
    // clears it so a zero-delay timer can't reach it uninitialised.
    let deadline;
    let done = false;
    const finish = (result, error) => {
      if (done) return;
      done = true;
      clearTimer(deadline);
      settle(key, entry, result, error);
    };

    deadline = setTimer(
      () => finish(null, new Error(`no response after ${Math.round(requestTimeoutMs / 1000)}s`)),
      requestTimeoutMs,
    );

    // Called synchronously — the request should leave the moment we decide to
    // make it — but a synchronous throw is folded into the rejection path:
    // fetchSummary throws rather than rejects when there is no session, and that
    // is a failure to retry, not a crash to propagate into the render loop.
    let reply;
    try {
      reply = Promise.resolve(fetchSummary(entry.range));
    } catch (error) {
      reply = Promise.reject(error);
    }

    reply.then((result) => finish(result, null), (error) => finish(null, error));
  }

  function settle(key, entry, result, error) {
    // Orphaned while we were away — invalidate() or retryFailures() dropped this
    // entry, so nobody is waiting for its answer.
    if (cache.get(key) !== entry) return;
    entry.inflight = false;

    // A non-finite number is a failure, not a value: Math.abs(NaN - 8) is NaN
    // and NaN >= tolerance is false, so without this guard NaN would sail
    // straight through the cross-check and onto the card as "+NaN h weekend".
    const ok = !!result
      && Number.isFinite(result.totalHours)
      && Number.isFinite(result.weekendHours);

    if (!ok) {
      // Deliberately NOT clearing totalHours/weekendHours: a 401 tells us
      // nothing about an answer we already proved, and throwing it away here is
      // how a single blip used to cost the bonus for the rest of the visit. The
      // cross-check in get() decides whether it still holds.
      const delay = backoffMs[entry.attempts - 1];
      if (delay !== undefined) {
        schedule(entry, delay);
      } else if (!entry.warned) {
        giveUp(entry, error?.message || 'the API returned a non-numeric total');
      }
      return;
    }

    entry.totalHours   = result.totalHours;
    entry.weekendHours = result.weekendHours;

    // Unconditional: re-rendering is idempotent and cheap, whereas deciding here
    // that nobody is looking at this range is how a correct answer ends up
    // sitting in the cache, never displayed, on a dashboard that has gone quiet.
    onChange();
  }

  // Weekend hours for `range`, or null while unknown. Synchronous and cheap by
  // design: safe to call on every mutation. `pageHours` is the total the
  // dashboard itself prints, and is what proves we fetched the right window.
  function get(range, pageHours) {
    if (!range?.key) return null;   // range not scrapeable yet

    const entry = entryFor(range);

    // A total Clockify has mounted but not yet filled in reads as "0" here, not
    // as NaN — parseTime('') is 0 — so anything non-positive means "no total to
    // compare against yet", never "the page says zero". Scoring it as a real
    // disagreement is how the retry budget used to be spent on a total that had
    // simply not rendered.
    const proven = pageHours > 0;
    if (proven) entry.pageHours = pageHours;

    // The one place a poll may start a request: a range never asked about
    // before. Every other attempt comes from a timer.
    if (entry.attempts === 0) {
      start(entry);
      return null;
    }

    if (entry.weekendHours === null) return null;   // in flight, backing off, or spent
    if (!proven) return null;                       // nothing to cross-check against

    if (Math.abs(entry.totalHours - pageHours) >= tolerance) {
      // Either we fetched the wrong window, or the entries moved under us — an
      // edit made elsewhere in the SPA, which the range key cannot see but the
      // page total can. Worth one more look, guarded so a total that was merely
      // mid-render costs nothing, and bounded so a dashboard filtered to one
      // project — whose printed total can never match an unfiltered API total —
      // settles into "unknown" instead of looping forever.
      if (entry.attempts < maxAttempts) {
        schedule(entry, backoffMs[0], disagrees);
      } else if (!entry.warned) {
        giveUp(entry, `the API total (${entry.totalHours.toFixed(2)}h) disagrees `
                    + `with the total the page prints (${pageHours.toFixed(2)}h)`);
      }
      return null;
    }

    return entry.weekendHours;
  }

  function cancel(entry) {
    if (entry.timer === null) return;
    clearTimer(entry.timer);
    entry.timer = null;
  }

  // Forget everything, including proven answers: arriving on the dashboard is
  // now the retry gesture a page reload used to be, so a visit costs one request
  // and can never show a number that predates it.
  function invalidate() {
    for (const entry of cache.values()) cancel(entry);
    cache.clear();
  }

  // Give only the *unanswered* ranges another chance — a lookup that failed or
  // spent its budget. Used where a re-attempt is welcome but re-downloading a
  // known-good range is not: a settings change, or a tab becoming visible after
  // burning its attempts unseen in the background.
  function retryFailures() {
    for (const [key, entry] of cache) {
      if (entry.inflight) continue;               // let it land
      if (entry.weekendHours !== null) continue;  // keep proven answers
      cancel(entry);
      cache.delete(key);
    }
  }

  return { get, invalidate, retryFailures };
}
