// Every Clockify selector, URL pattern, and DOM-scraping routine lives in this
// file, so a Clockify UI change is a one-file fix.

import { parseTime } from '../shared/format.js';
import { weekdayFromLabel, isWeekendLabel, summarizeWeekend } from '../shared/weekday.js';

// "HH:MM:SS" — how Clockify renders day and week totals.
export const TIME_RE = /^\d{1,2}:\d{2}:\d{2}$/;

// ── SPA routing ───────────────────────────────────────────────────────────────

export function isDashboard() { return location.pathname.startsWith('/dashboard'); }
export function isCalendar()  { return location.pathname.startsWith('/calendar'); }
export function isTracker()   { return location.pathname.startsWith('/tracker'); }

// ── Dashboard ─────────────────────────────────────────────────────────────────
// The daily activity chart here is a <canvas> (ng2-charts/Chart.js, bundled so
// there is no reachable instance): its bars and axis labels are painted pixels,
// not DOM. Per-day hours therefore come from the Clockify API instead — see
// clockify-api.js. All this file contributes is the displayed date range.

export function getDashboardTotalEl() {
  return document.querySelector('[data-cy="total-time"]');
}

// The header item the earnings card is inserted after.
export function getDashboardAnchor(totalEl) {
  return totalEl.closest('.cl-dashboard-card-header-item');
}

// The range the dashboard is currently showing, as { key, startISO, endISO }.
// The picker itself may read "This month", but a print-only sibling always
// carries the resolved dates ("Aug 1, 2026 - Aug 31, 2026"). Returns null if
// the dates cannot be parsed — the caller then shows no weekend split rather
// than querying the wrong window.
export function getDashboardRange() {
  const el = [...document.querySelectorAll('datepicker-range .cl-d-print-block')]
    .find((e) => e.textContent.includes('-'));
  if (!el) return null;

  const key   = el.textContent.replace(/\s+/g, ' ').trim();
  const parts = key.split(/\s+-\s+/);
  if (parts.length !== 2) return null;

  // Parsed as local dates, matching how Clockify presents the range.
  const from = new Date(parts[0]);
  const to   = new Date(parts[1]);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  to.setHours(23, 59, 59, 999);

  return { key, startISO: from.toISOString(), endISO: to.toISOString() };
}

// ── Calendar ──────────────────────────────────────────────────────────────────

// Sum the per-day totals shown in each calendar day header. Each <day-header>
// holds a day label and an "HH:MM:SS" total; we read only the total, never the
// per-event durations inside the grid, so nothing is double-counted. The label
// also tells us the weekday, which is what splits out the weekend hours.
// Returns { hours, days, weekendHours } or null when the grid hasn't rendered.
export function getWeekTotals() {
  const headers = document.querySelectorAll('day-header');
  if (!headers.length) return null;

  let hours = 0;
  let weekendHours = 0;
  headers.forEach((h) => {
    const timeDiv = [...h.querySelectorAll('div')]
      .find((d) => TIME_RE.test(d.textContent.trim()));
    if (!timeDiv) return;

    const dayHours = parseTime(timeDiv.textContent.trim());
    hours += dayHours;

    // Header text minus the duration is the day label ("Sat 1", "sam. 1").
    const label = h.textContent.replace(timeDiv.textContent, '').trim();
    if (isWeekendLabel(label)) weekendHours += dayHours;
  });
  return { hours, days: headers.length, weekendHours };
}

// Fingerprint of the visible range (day labels + totals) so we only re-render on
// a real change — week navigation or an edited entry — and not on every unrelated
// calendar mutation (drag overlays, the live time indicator, …).
export function weekSignature() {
  const headers = document.querySelectorAll('day-header');
  if (!headers.length) return '';
  return [...headers].map((h) => h.textContent.trim()).join('|');
}

export function calendarReady() {
  return !!document.querySelector('switch-calendar') && !!document.querySelector('day-header');
}

// The week pill sits inline, right after the Calendar / Week / Day button group.
export function getCalendarAnchor() {
  return document.querySelector('switch-calendar');
}

// ── Tracker ───────────────────────────────────────────────────────────────────
// The time-tracker list groups entries by day, each group preceded by an
// <entry-group-header> showing a date label and "Total: HH:MM:SS". The whole
// range is summed by an <approval-header> showing "Week total: HH:MM:SS".
// Clockify already gives us both totals, so we just read them — no need to sum
// individual entries. Having both is also what lets us prove the scrape is
// complete (see getTrackerRangeSummary).

const DAY_TOTAL_SEL = '[data-cy="entry-header-total-duration"]';

// The day label sits in the same group header as the total. Prefer an explicit
// date node; otherwise take "header text minus the duration", which survives
// Clockify renaming its inner elements.
function dayGroupLabel(totalEl) {
  const header = totalEl.closest('entry-group-header') || totalEl.parentElement;
  if (!header) return '';

  const dateEl = header.querySelector('[data-cy="entry-header-date"], .cl-date');
  if (dateEl) return dateEl.textContent.trim();

  return header.textContent
    .replace(totalEl.textContent, '')
    .replace(/total\s*:?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// [{ totalEl, label, hours, weekday }] — one per day group. The sticky header
// duplicates the current group: callers that INJECT want both copies (each needs
// a badge), callers that SUM must dedupe by label.
export function getDayTotals() {
  return [...document.querySelectorAll(DAY_TOTAL_SEL)].map((totalEl) => {
    const label = dayGroupLabel(totalEl);
    return {
      totalEl,
      label,
      hours:   parseTime(totalEl.textContent.trim()),
      weekday: weekdayFromLabel(label),
    };
  });
}

function approvalTotalEl(header) {
  return [...header.querySelectorAll('.cl-h2')]
    .find((d) => TIME_RE.test(d.textContent.trim()));
}

// All visible range totals — there may be several at once (This week, Last
// week, …) when the displayed range spans weeks. Walks approval-headers and
// group headers in document order: every day group belongs to the approval
// header that precedes it. Returns [{ totalEl, label, weekendHours }].
export function getTrackerWeekTotals() {
  const groups = [];
  let current = null;

  for (const node of document.querySelectorAll('approval-header, entry-group-header')) {
    if (node.matches('approval-header')) {
      const totalEl = approvalTotalEl(node);
      current = totalEl
        ? { totalEl, label: node.querySelector('span')?.textContent.trim() || 'Total', days: new Map() }
        : null;
      if (current) groups.push(current);
      continue;
    }

    // Day groups before the first approval header have no range to belong to;
    // dropping them under-counts, which is the safe direction.
    if (!current) continue;
    const dayTotalEl = node.querySelector(DAY_TOTAL_SEL);
    if (!dayTotalEl) continue;

    const label = dayGroupLabel(dayTotalEl);
    // Keyed by label so the sticky duplicate collapses onto its original.
    current.days.set(label, {
      hours:   parseTime(dayTotalEl.textContent.trim()),
      weekday: weekdayFromLabel(label),
    });
  }

  return groups.map(({ totalEl, label, days }) => ({
    totalEl,
    label,
    weekendHours: summarizeWeekend([...days.values()]).weekendHours,
  }));
}

// Weekend split for the whole displayed range, WITH a completeness proof.
//
// Clockify lazy-loads entries as you scroll, so the visible day groups may not
// cover the selected range. Comparing their sum against the range totals it
// declares is what tells us whether we saw everything. Only a complete summary
// may pre-fill an invoice — a partial one is an under-count, and an under-count
// on an invoice is money never billed.
// Returns null when there is no declared total to check against.
export function getTrackerRangeSummary() {
  const days = new Map();
  for (const day of getDayTotals()) days.set(day.label, day);

  const ranges = [...document.querySelectorAll('approval-header')]
    .map(approvalTotalEl)
    .filter(Boolean);
  if (!ranges.length) return null;

  const declaredHours = ranges.reduce((sum, el) => sum + parseTime(el.textContent.trim()), 0);
  const summary       = summarizeWeekend([...days.values()]);
  // One minute of tolerance: Clockify rounds the totals it prints to the second.
  const complete      = summary.complete && Math.abs(summary.totalHours - declaredHours) < 1 / 60;

  return { ...summary, declaredHours, dayCount: days.size, complete };
}

export function trackerReady() {
  return !!document.querySelector(DAY_TOTAL_SEL) || !!document.querySelector('approval-header');
}

// Fingerprint of every day total plus every week total, so we only re-render on
// a real change — range navigation or an edited entry — not on every unrelated
// mutation (hover shadows, dropdowns, the running timer). Day labels and the
// weekend split are part of the key: moving an entry from Saturday to Monday
// leaves the durations identical but must still re-render.
export function trackerSignature() {
  const days  = getDayTotals().map((d) => d.label + '=' + d.totalEl.textContent.trim());
  const weeks = getTrackerWeekTotals().map(({ totalEl, weekendHours }) =>
    totalEl.textContent.trim() + '+' + weekendHours.toFixed(2));
  if (!days.length && !weeks.length) return '';
  return days.join('|') + '#' + weeks.join('|');
}

// ── Projects (dashboard bar chart) ────────────────────────────────────────────

// Clockify renders the project breakdown as a horizontal bar chart table.
// Each <tr> has the project name in a span[title] and the duration in td.cl-w-10.
export function extractProjects() {
  const results = [];

  const rows = document.querySelectorAll(
    'table.cl-main-horizontal-chart-container tbody tr'
  );

  for (const row of rows) {
    const nameSpan = row.querySelector(
      'td.cl-main-horizontal-chart-container--label span[title]'
    );
    const timeSpan = row.querySelector('td.cl-w-10 span');
    if (!nameSpan || !timeSpan) continue;

    // title attr = "Project - Client"; keep only the project part (before " - ")
    const fullTitle = nameSpan.getAttribute('title')?.trim() || '';
    const name      = fullTitle.split(' - ')[0].trim() || fullTitle;
    const timeText  = timeSpan.textContent.trim();
    const hours     = parseTime(timeText);

    if (!name || hours <= 0) continue;
    results.push({ name, timeText, hours });
  }

  return results;
}
