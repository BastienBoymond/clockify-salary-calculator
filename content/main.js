// Orchestration: keep the right widgets on the current page as the Clockify
// SPA renders, navigates, and mutates. Scraping lives in selectors.js, widget
// construction in widgets.js, math and settings in ../shared/.

import { parseTime } from '../shared/format.js';
import { loadSettings, SETTINGS_KEYS } from '../shared/settings.js';
import {
  isDashboard, isCalendar, isTracker,
  getDashboardTotalEl, getDashboardAnchor,
  getWeekTotals, weekSignature, calendarReady, getCalendarAnchor,
  getDayTotalEls, getTrackerWeekTotals, trackerReady, trackerSignature,
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

function injectDashboard(totalEl) {
  document.getElementById(CARD_ID)?.remove();
  if (!settings.showDashboard || !settings.hourlyRate) return;

  const anchor = getDashboardAnchor(totalEl);
  if (!anchor) return;

  anchor.insertAdjacentElement('afterend', buildCard(settings, parseTime(totalEl.textContent)));
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
    getDayTotalEls().forEach((el) => {
      el.insertAdjacentElement('afterend', buildDayBadge(settings, parseTime(el.textContent.trim())));
    });
  }

  // A range pill next to every "Week total" (This week, Last week, …).
  if (settings.showTrackerWeek) {
    getTrackerWeekTotals().forEach(({ totalEl, label }) => {
      const hours = parseTime(totalEl.textContent.trim());
      totalEl.insertAdjacentElement(
        'afterend',
        buildWeekWidget(settings, { hours }, { id: null, cls: TRACKER_WEEK_CLASS, label })
      );
    });
  }
}

// Have all expected tracker widgets actually landed in the DOM? With no rate set
// we inject nothing, so "nothing present" is the correct, fully-injected state.
function trackerFullyInjected() {
  if (!settings.hourlyRate) return true;

  // Expected counts depend on the toggles: a disabled widget expects zero.
  const dayTargets = settings.showTrackerDay ? getDayTotalEls().length : 0;
  const dayBadges  = document.querySelectorAll('.' + DAY_BADGE_CLASS).length;
  if (dayBadges !== dayTargets) return false;

  const weekTargets = settings.showTrackerWeek ? getTrackerWeekTotals().length : 0;
  const weekPills   = document.querySelectorAll('.' + TRACKER_WEEK_CLASS).length;
  return weekPills === weekTargets;
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
    const key     = totalEl.textContent.trim();
    const want    = settings.showDashboard && settings.hourlyRate > 0;
    const present = !!document.getElementById(CARD_ID);
    const full    = want ? present : !present;
    if (key === lastTimeText && full) return;
    lastTimeText = key;
    injectDashboard(totalEl);

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

function onNavigate() {
  if (!isDashboard()) document.getElementById(CARD_ID)?.remove();
  if (!isCalendar())  document.getElementById(WEEK_ID)?.remove();
  if (!isTracker())   removeTrackerWidgets();
  resetKeys();
  evaluateAndInject();
}

['pushState', 'replaceState'].forEach((method) => {
  const original = history[method];
  history[method] = function (...args) {
    const result = original.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
    return result;
  };
});

window.addEventListener('popstate', onNavigate);
window.addEventListener('locationchange', onNavigate);

// ── MutationObserver ──────────────────────────────────────────────────────────

let scheduled = false;

const observer = new MutationObserver(() => {
  if (!isDashboard() && !isCalendar() && !isTracker()) return;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    evaluateAndInject();
  });
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// ── Settings changes ──────────────────────────────────────────────────────────
// Re-render whenever an earnings setting changes — a popup save, a live widget
// toggle, or a sync from another device. Invoice keys etc. are filtered out.

async function refreshAndReinject() {
  settings = await loadSettings();
  resetKeys();
  evaluateAndInject();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!SETTINGS_KEYS.some((key) => key in changes)) return;
  refreshAndReinject();
});

// ── Messages from the popup ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PROJECTS') {
    sendResponse({ projects: extractProjects() });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

refreshAndReinject();
