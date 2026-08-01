// Weekday resolution from whatever a page gives us: an ISO date when one is
// available, otherwise a localized day label ("Sat, Aug 1", "sam. 1 août",
// "Today"). Clockify renders these in the user's own locale, so the name tables
// are generated with Intl rather than hard-coded.
//
// Safety rule, applied throughout: an unrecognised label resolves to null, and
// null is NEVER treated as a weekend. Money only ever errs downward.
//
// Known limitation: German short names are two letters ("So", "Sa") and could
// in principle match a stray word. It only fires when the browser locale is
// German, and only on day-label text.

export const SUNDAY   = 0;
export const SATURDAY = 6;

// ── ISO dates ─────────────────────────────────────────────────────────────────

// "YYYY-MM-DD" → 0..6 (Sun..Sat), or null. Computed in UTC so the answer is the
// same in every timezone, matching addDays() in format.js.
export function isoWeekday(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

export function isWeekendDay(weekday) {
  return weekday === SUNDAY || weekday === SATURDAY;
}

export function isWeekendISO(iso) {
  return isWeekendDay(isoWeekday(iso));
}

// ── Localized labels ──────────────────────────────────────────────────────────

// Diacritics, case, punctuation, hyphens and apostrophes all stripped, so
// "Sam."/"sam"/"SAMEDI" collapse onto "sam"/"samedi", "segunda-feira" onto
// "segundafeira", and "aujourd’hui" (curly apostrophe) onto "aujourdhui".
function normalizeToken(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

// 2023-01-01 was a Sunday — the anchor for generating all seven weekday names.
function anchorDate(index) {
  return new Date(Date.UTC(2023, 0, 1 + index));
}

export function defaultLocales() {
  const nav = typeof navigator === 'object' && navigator ? navigator : null;
  return [...new Set([
    ...(Array.isArray(nav?.languages) ? nav.languages : []),
    nav?.language,
    'en-US',
  ].filter(Boolean))];
}

// Marks a token that means different weekdays in different locales of the set.
const POISON = -1;

export function buildWeekdayTable(locales = defaultLocales()) {
  const table = new Map();
  const add = (token, index) => {
    if (!token || token.length < 2) return;
    const prev = table.get(token);
    if (prev === undefined) table.set(token, index);
    else if (prev !== index) table.set(token, POISON);
  };

  for (const locale of locales) {
    // 'narrow' is deliberately excluded: M/T/W/T/F/S/S is ambiguous by design.
    for (const weekday of ['long', 'short']) {
      let fmt;
      try { fmt = new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' }); }
      catch { continue; }
      for (let i = 0; i < 7; i++) add(normalizeToken(fmt.format(anchorDate(i))), i);
    }
  }
  return table;
}

// "today" / "yesterday" / "tomorrow" in each locale → offset in days.
export function buildRelativeTable(locales = defaultLocales()) {
  const table = new Map();
  for (const locale of locales) {
    let rtf;
    try { rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }); }
    catch { continue; }
    for (const offset of [0, -1, 1]) {
      const token = normalizeToken(rtf.format(offset, 'day'));
      if (token && !table.has(token)) table.set(token, offset);
    }
  }
  return table;
}

let cachedWeekdays = null;
let cachedRelative = null;

// "Sat, Aug 1" | "mer. 29 juil." | "Today" | "2026-08-01" → 0..6, or null.
//
// Tokens are scanned LEFT TO RIGHT and the first hit wins: Clockify always puts
// the weekday first, which sidesteps month/weekday collisions such as Italian
// "mar" (martedì AND marzo).
export function weekdayFromLabel(label, locales) {
  const text = (label || '').trim();
  if (!text) return null;

  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return isoWeekday(iso[0]);

  const weekdays = locales ? buildWeekdayTable(locales) : (cachedWeekdays ??= buildWeekdayTable());
  const relative = locales ? buildRelativeTable(locales) : (cachedRelative ??= buildRelativeTable());

  // Apostrophes and hyphens stay inside tokens so "aujourd’hui" and
  // "segunda-feira" survive the split; normalizeToken strips them after.
  for (const raw of text.split(/[^\p{L}\p{N}\-’']+/u)) {
    const token = normalizeToken(raw);
    if (!token) continue;

    const offset = relative.get(token);
    if (offset !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.getDay();
    }

    const index = weekdays.get(token);
    if (index !== undefined) return index === POISON ? null : index;
  }
  return null;
}

// Unknown label → false. Never guess a bonus into existence.
export function isWeekendLabel(label, locales) {
  return isWeekendDay(weekdayFromLabel(label, locales));
}

// ── Aggregation ───────────────────────────────────────────────────────────────

// days: [{ hours, weekday }] → weekend total plus what could not be classified.
// `complete` is one of the two locks the invoice flow gates auto-fill on.
export function summarizeWeekend(days = []) {
  let weekendHours = 0, unknownHours = 0, unknownDays = 0, totalHours = 0;
  for (const day of days) {
    const hours = Number(day?.hours) || 0;
    totalHours += hours;
    if (day?.weekday == null) { unknownHours += hours; unknownDays += 1; continue; }
    if (isWeekendDay(day.weekday)) weekendHours += hours;
  }
  return { weekendHours, unknownHours, unknownDays, totalHours, complete: unknownDays === 0 };
}
