// Every Clockify selector, URL pattern, and DOM-scraping routine lives in this
// file, so a Clockify UI change is a one-file fix.

import { parseTime } from '../shared/format.js';

// "HH:MM:SS" — how Clockify renders day and week totals.
export const TIME_RE = /^\d{1,2}:\d{2}:\d{2}$/;

// ── SPA routing ───────────────────────────────────────────────────────────────

export function isDashboard() { return location.pathname.startsWith('/dashboard'); }
export function isCalendar()  { return location.pathname.startsWith('/calendar'); }
export function isTracker()   { return location.pathname.startsWith('/tracker'); }

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function getDashboardTotalEl() {
  return document.querySelector('[data-cy="total-time"]');
}

// The header item the earnings card is inserted after.
export function getDashboardAnchor(totalEl) {
  return totalEl.closest('.cl-dashboard-card-header-item');
}

// ── Calendar ──────────────────────────────────────────────────────────────────

// Sum the per-day totals shown in each calendar day header. Each <day-header>
// holds a day label and an "HH:MM:SS" total; we read only the total, never the
// per-event durations inside the grid, so nothing is double-counted.
// Returns { hours, days } or null when the calendar grid hasn't rendered yet.
export function getWeekTotals() {
  const headers = document.querySelectorAll('day-header');
  if (!headers.length) return null;

  let hours = 0;
  headers.forEach((h) => {
    const timeDiv = [...h.querySelectorAll('div')]
      .find((d) => TIME_RE.test(d.textContent.trim()));
    if (timeDiv) hours += parseTime(timeDiv.textContent.trim());
  });
  return { hours, days: headers.length };
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
// <entry-group-header> showing "Total: HH:MM:SS". The whole range is summed by an
// <approval-header> showing "Week total: HH:MM:SS". Clockify already gives us both
// totals, so we just read them — no need to sum individual entries.

const DAY_TOTAL_SEL = '[data-cy="entry-header-total-duration"]';

export function getDayTotalEls() {
  return [...document.querySelectorAll(DAY_TOTAL_SEL)];
}

function approvalTotalEl(header) {
  return [...header.querySelectorAll('.cl-h2')]
    .find((d) => TIME_RE.test(d.textContent.trim()));
}

// All visible range totals — there may be several at once (This week, Last
// week, …) when the displayed range spans weeks. Returns [{ totalEl, label }].
export function getTrackerWeekTotals() {
  return [...document.querySelectorAll('approval-header')].flatMap((header) => {
    const totalEl = approvalTotalEl(header);
    if (!totalEl) return [];
    const label = header.querySelector('span')?.textContent.trim() || 'Total';
    return [{ totalEl, label }];
  });
}

export function trackerReady() {
  return !!document.querySelector(DAY_TOTAL_SEL) || !!document.querySelector('approval-header');
}

// Fingerprint of every day total plus every week total, so we only re-render on
// a real change — range navigation or an edited entry — not on every unrelated
// mutation (hover shadows, dropdowns, the running timer).
export function trackerSignature() {
  const days  = getDayTotalEls().map((d) => d.textContent.trim());
  const weeks = getTrackerWeekTotals().map(({ totalEl }) => totalEl.textContent.trim());
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
