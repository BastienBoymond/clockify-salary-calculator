// Orchestration: keep the right widgets on the current page as the Clockify
// SPA renders, navigates, and mutates. Scraping lives in selectors.js, widget
// construction in widgets.js, math and settings in ../shared/.

import { parseTime } from '../shared/format.js';
import { loadSettings, SETTINGS_KEYS } from '../shared/settings.js';
import { isWeekendDay } from '../shared/weekday.js';
import { summarizeEntries } from '../shared/time-entries.js';
import { getSession, fetchTimeEntries } from './clockify-api.js';
import { createWeekendLookup } from './weekend-lookup.js';
import {
  isDashboard, isCalendar, isTracker,
  getDashboardTotalEl, getDashboardAnchor, getDashboardRange,
  getWeekTotals, weekSignature, calendarReady, getCalendarAnchor,
  getDayTotals, getTrackerWeekTotals, getTrackerRangeSummary, trackerReady, trackerSignature,
  extractProjects,
} from './selectors.js';
import {
  CARD_ID, WEEK_ID, TRACKER_WEEK_CLASS, DAY_BADGE_CLASS,
  buildCard, buildWeekWidget, buildDayBadge,
} from './widgets.js';

// Settings are cached so injection decisions are synchronous — the observer can
// check "is my widget already present?" without waiting on an async storage read,
// which is what lets us retry reliably instead of locking on a half-rendered page.
let settings = null;

// ── Per-page injection ────────────────────────────────────────────────────────

function injectDashboard(totalEl, weekendHours) {
  document.getElementById(CARD_ID)?.remove();
  if (!settings.showDashboard || !settings.hourlyRate) return;

  const anchor = getDashboardAnchor(totalEl);
  if (!anchor) return;

  anchor.insertAdjacentElement('afterend', buildCard(settings, parseTime(totalEl.textContent), {
    weekendHours: weekendHours ?? 0,
    weekendKnown: weekendHours != null,
  }));
}

function injectCalendar() {
  document.getElementById(WEEK_ID)?.remove();
  if (!settings.showCalendar) return;

  const totals = getWeekTotals();
  if (!totals) return;

  const anchor = getCalendarAnchor();
  if (!anchor) return;

  anchor.insertAdjacentElement('afterend', buildWeekWidget(settings, totals));
}

function removeTrackerWidgets() {
  document.querySelectorAll('.' + DAY_BADGE_CLASS).forEach((b) => b.remove());
  document.querySelectorAll('.' + TRACKER_WEEK_CLASS).forEach((w) => w.remove());
}

function injectTracker() {
  removeTrackerWidgets();
  if (!settings.hourlyRate) return;

  // Per-day badge after each group header total (covers the sticky header too).
  if (settings.showTrackerDay) {
    getDayTotals().forEach(({ totalEl, hours, weekday }) => {
      totalEl.insertAdjacentElement(
        'afterend',
        buildDayBadge(settings, hours, { weekendHours: isWeekendDay(weekday) ? hours : 0 })
      );
    });
  }

  // A range pill next to every "Week total" (This week, Last week, …).
  if (settings.showTrackerWeek) {
    getTrackerWeekTotals().forEach(({ totalEl, label, weekendHours }) => {
      const hours = parseTime(totalEl.textContent.trim());
      totalEl.insertAdjacentElement(
        'afterend',
        buildWeekWidget(settings, { hours, weekendHours }, { id: null, cls: TRACKER_WEEK_CLASS, label })
      );
    });
  }
}

// Have all expected tracker widgets actually landed in the DOM? With no rate set
// we inject nothing, so "nothing present" is the correct, fully-injected state.
function trackerFullyInjected() {
  if (!settings.hourlyRate) return true;

  // Expected counts depend on the toggles: a disabled widget expects zero.
  const dayTargets = settings.showTrackerDay ? getDayTotals().length : 0;
  const dayBadges  = document.querySelectorAll('.' + DAY_BADGE_CLASS).length;
  if (dayBadges !== dayTargets) return false;

  const weekTargets = settings.showTrackerWeek ? getTrackerWeekTotals().length : 0;
  const weekPills   = document.querySelectorAll('.' + TRACKER_WEEK_CLASS).length;
  return weekPills === weekTargets;
}

// ── Dashboard weekend split (Clockify API) ────────────────────────────────────
// The dashboard's daily chart is a canvas, so the only exact source of per-day
// hours is the API. Deciding when to ask, what to cache and when to retry lives
// in weekend-lookup.js; all that belongs here is the fetch and the re-render.

const weekendLookup = createWeekendLookup({
  fetchSummary: async ({ startISO, endISO }) => {
    const session = getSession();
    // Empty for a few hundred ms while Clockify refreshes its token mid-route
    // change — a transient the lookup retries, not a permanent answer.
    if (!session) throw new Error('no Clockify session');

    const entries = await fetchTimeEntries(session, startISO, endISO);
    const { totalHours, weekendHours } = summarizeEntries(entries, session.timeZone);
    return { totalHours, weekendHours };
  },
  onChange: () => { resetKeys(); evaluateAndInject(); },
});

// Weekend hours for the range on screen, or null while unknown. Cheap enough to
// call on every mutation; the lookup decides whether that costs a request.
function dashboardWeekendHours(pageHours) {
  if (!(settings.weekendBonus > 0)) return 0;   // nothing to split out

  const range = getDashboardRange();
  return range ? weekendLookup.get(range, pageHours) : null;
}

// ── Injection orchestration ───────────────────────────────────────────────────

let lastTimeText   = '';
let lastWeekKey    = '';
let lastTrackerKey = '';

function resetKeys() {
  lastTimeText   = '';
  lastWeekKey    = '';
  lastTrackerKey = '';
}

// Single entry point for "make sure the right widget is on the current page".
// Re-injects when the content signature changed OR when our widget isn't actually
// present (Angular can wipe it, or the injection anchor rendered after the content
// did). The key is committed only once the page is ready, so a half-rendered page
// is retried on the next mutation instead of being locked out until a reload.
function evaluateAndInject() {
  if (!settings) return; // settings not loaded yet; bootstrap will run this

  if (isDashboard()) {
    const totalEl = getDashboardTotalEl();
    if (!totalEl) return;
    const want = settings.showDashboard && settings.hourlyRate > 0;
    // The weekend split is part of the key: moving an entry from Saturday to
    // Monday leaves the page total identical but must still re-render. Asked for
    // only when there is a card to put it on, so a hidden widget costs no fetch.
    const weekend = want ? dashboardWeekendHours(parseTime(totalEl.textContent)) : 0;
    const key     = totalEl.textContent.trim() + '#' + (weekend ?? 'x');
    const present = !!document.getElementById(CARD_ID);
    const full    = want ? present : !present;
    if (key === lastTimeText && full) return;
    lastTimeText = key;
    injectDashboard(totalEl, weekend);

  } else if (isCalendar()) {
    if (!calendarReady()) return;
    const key     = weekSignature();
    const present = !!document.getElementById(WEEK_ID);
    const full    = settings.showCalendar ? present : !present;
    if (key === lastWeekKey && full) return;
    lastWeekKey = key;
    injectCalendar();

  } else if (isTracker()) {
    if (!trackerReady()) return;
    const key  = trackerSignature();
    const full = trackerFullyInjected();
    if (key === lastTrackerKey && full) return;
    lastTrackerKey = key;
    injectTracker();
  }
}

// ── SPA navigation detection ──────────────────────────────────────────────────
// Angular navigates by calling history.pushState in the PAGE's JavaScript world.
// A content script runs in an isolated world, so patching history.pushState here
// would never see those calls — the pathname itself is the only signal we can
// trust. Query-string changes are deliberately not navigation: the date picker
// writes the displayed range into the URL, and the range key already covers that.

let lastPath = location.pathname;

function onNavigate() {
  lastPath = location.pathname;   // the one place the path is committed
  if (!isDashboard()) document.getElementById(CARD_ID)?.remove();
  if (!isCalendar())  document.getElementById(WEEK_ID)?.remove();
  if (!isTracker())   removeTrackerWidgets();
  // Arriving on a page is the retry: the weekend lookup used to remember a
  // failed fetch until the tab was reloaded.
  weekendLookup.invalidate();
  resetKeys();
  evaluateAndInject();
}

// True when this call handled a route change, so the caller can stand down.
// Everything routes through here rather than calling onNavigate directly: a
// same-path history entry must not tear anything down. Clockify pushes one per
// date-range change, so Back over them would otherwise discard a proven answer
// and re-fetch on every press.
function checkNavigation() {
  if (location.pathname === lastPath) return false;
  onNavigate();
  return true;
}

window.addEventListener('popstate', checkNavigation);   // fires in both worlds

// ── MutationObserver ──────────────────────────────────────────────────────────

let scheduled = false;

const observer = new MutationObserver(() => {
  if (checkNavigation()) return;   // onNavigate() has already re-evaluated
  if (!isDashboard() && !isCalendar() && !isTracker()) return;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    evaluateAndInject();
  });
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// Backstop for a pathname change whose DOM mutations were already delivered — an
// Angular replaceState canonicalisation, or a route whose markup was rendered
// before the URL moved. The observer would see no further mutation to react to.
// (It is NOT a background-tab backstop: Chrome clamps a hidden tab's intervals to
// ≥1s and eventually ~1/min. It doesn't need to be — parked requestAnimationFrame
// callbacks are retained and run on the first frame after the tab is visible.)
//
// Also where an orphaned content script notices it is orphaned: after the
// extension reloads or updates, this world keeps running with chrome.runtime
// severed, so `settings` can never refresh again — and silently re-injecting a
// card built from stale rates is worse than injecting nothing.
const navigationPoll = setInterval(() => {
  if (!chrome.runtime?.id) {
    clearInterval(navigationPoll);
    observer.disconnect();
    return;
  }
  checkNavigation();
}, 500);

// ── Settings changes ──────────────────────────────────────────────────────────
// Re-render whenever an earnings setting changes — a popup save, a live widget
// toggle, or a sync from another device. Invoice keys etc. are filtered out.

async function refreshAndReinject() {
  settings = await loadSettings();
  // retryFailures, not invalidate: none of these settings can move an hour from
  // Saturday to Monday, so a proven answer stays proven. Discarding it here would
  // flash "weekend bonus not included" onto the card and re-download the range on
  // every unrelated toggle — in every open tab, since sync fans out.
  weekendLookup.retryFailures();
  resetKeys();
  evaluateAndInject();
}

// A tab can burn its whole retry budget while hidden — a settings sync from
// another device is enough to start one — and coming back to it changes neither
// the pathname nor the DOM, so nothing else here would ever re-attempt. Looking
// at the tab again is the gesture; proven answers are kept.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  weekendLookup.retryFailures();
  resetKeys();
  evaluateAndInject();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!SETTINGS_KEYS.some((key) => key in changes)) return;
  refreshAndReinject();
});

// ── Messages from the popup ───────────────────────────────────────────────────

// weekendHours is null whenever we could not establish it with certainty —
// wrong page, no session, or a total that disagrees with the page. Never 0 by
// default: a silent 0 is money never billed.
async function buildInvoiceData() {
  const projects = extractProjects();   // [] anywhere but the dashboard

  // Tracker: the DOM already gives a day-by-day split that proves its own
  // completeness, so no network call is needed.
  if (isTracker()) {
    const summary = getTrackerRangeSummary();
    return {
      page: 'tracker', source: 'tracker', projects,
      weekendHours: summary?.complete ? summary.weekendHours : null,
      dayCount:     summary ? summary.dayCount    : null,
      unknownDays:  summary ? summary.unknownDays : null,
    };
  }

  // Dashboard: canvas chart, so ask the API for the displayed range and check
  // the answer against the total the page prints.
  if (isDashboard()) {
    const totalEl   = getDashboardTotalEl();
    const pageHours = totalEl ? parseTime(totalEl.textContent) : null;
    const range     = getDashboardRange();
    const session   = getSession();

    if (range && session) {
      try {
        const entries = await fetchTimeEntries(session, range.startISO, range.endISO);
        const summary = summarizeEntries(entries, session.timeZone);
        const agrees  = pageHours == null || Math.abs(summary.totalHours - pageHours) < 1 / 60;
        return {
          page: 'dashboard', source: 'api', projects, range: range.key,
          weekendHours: agrees ? summary.weekendHours : null,
          dayCount:     summary.days.length,
        };
      } catch { /* fall through to the unknown answer below */ }
    }
    return { page: 'dashboard', source: 'none', projects, weekendHours: null, dayCount: null };
  }

  return { page: 'other', source: 'none', projects, weekendHours: null, dayCount: null };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PROJECTS') {
    sendResponse({ projects: extractProjects() });
    return;
  }

  if (msg.type === 'GET_INVOICE_DATA') {
    buildInvoiceData()
      .then(sendResponse)
      .catch(() => sendResponse({ page: 'error', projects: [], weekendHours: null, dayCount: null }));
    return true;   // keep the channel open for the async reply
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

refreshAndReinject();
