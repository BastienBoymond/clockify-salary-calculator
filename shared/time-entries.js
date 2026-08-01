// Turning Clockify API time entries into per-day hours.
//
// Timezone is the whole difficulty here. The API reports UTC instants, but
// Clockify's UI buckets an entry into the day its START falls on *in the user's
// own timezone*. An entry starting 2026-07-31T22:00:00Z is Friday 31 July in
// UTC and Saturday 1 August in Europe/Paris — read it as UTC and the weekend
// bonus silently disappears. So every grouping here goes through Intl with an
// explicit timezone.

import { isWeekendISO } from './weekday.js';

// ISO 8601 duration ("PT3H15M", "PT45M", "PT1H", "PT30.5S") → decimal hours.
export function durationHours(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(iso || '');
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return (Number(m[1]) || 0) + (Number(m[2]) || 0) / 60 + (Number(m[3]) || 0) / 3600;
}

// A still-running entry has duration: null and end: null. Clockify counts its
// elapsed time in the page totals, so we do too.
function entryHours(entry, now) {
  const interval = entry?.timeInterval;
  if (!interval?.start) return 0;

  const fromDuration = durationHours(interval.duration);
  if (fromDuration > 0) return fromDuration;

  if (interval.end) return 0;                 // ended but zero-length
  const elapsed = (now - new Date(interval.start).getTime()) / 3_600_000;
  return elapsed > 0 ? elapsed : 0;
}

// [{ date: 'YYYY-MM-DD', hours }] in the given timezone, ascending by date.
// timeZone undefined → the runtime's own zone, which is what the browser shows.
export function dailyHours(entries = [], timeZone, now = Date.now()) {
  // 'en-CA' formats as YYYY-MM-DD, which is exactly the key we want.
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const byDate = new Map();
  for (const entry of entries) {
    const start = entry?.timeInterval?.start;
    if (!start) continue;
    const hours = entryHours(entry, now);
    if (hours <= 0) continue;

    const date = fmt.format(new Date(start));
    byDate.set(date, (byDate.get(date) || 0) + hours);
  }

  return [...byDate.entries()]
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// { days, totalHours, weekendHours } — the shape the widgets and the invoice
// consume. Dates are plain YYYY-MM-DD by this point, so the weekday lookup is
// unambiguous.
export function summarizeEntries(entries = [], timeZone, now = Date.now()) {
  const days = dailyHours(entries, timeZone, now);
  let totalHours = 0;
  let weekendHours = 0;
  for (const day of days) {
    totalHours += day.hours;
    if (isWeekendISO(day.date)) weekendHours += day.hours;
  }
  return { days, totalHours, weekendHours };
}
