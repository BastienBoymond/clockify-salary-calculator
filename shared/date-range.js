// Calendar dates on Clockify's dashboard must be interpreted in the account's
// timezone, even when the browser has moved to a different timezone.
const DAY_MS = 86_400_000;

// Match dailyHours' fallback for a missing or invalid Clockify timezone, but
// return an explicit zone so the range and its entries share one snapshot.
export function resolveTimeZone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return new Intl.DateTimeFormat('en').resolvedOptions().timeZone;
  }
}

// Date-only labels ("Sep 1, 2026" or "2026-09-01") → inclusive UTC API bounds.
export function dateRangeBounds(startLabel, endLabel, timeZone) {
  // Parse calendar fields in UTC so neither date can shift with the browser's
  // timezone. These numbers represent dates, not the eventual API instants.
  const firstDay = Date.parse(`${startLabel} UTC`);
  const lastDay  = Date.parse(`${endLabel} UTC`);
  if (!Number.isFinite(firstDay) || !Number.isFinite(lastDay) || firstDay > lastDay) return null;

  timeZone = resolveTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  function localDay(instant) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  }

  // Find the first instant belonging to this local date. Searching by calendar
  // date also handles zones where DST skips or repeats midnight. The window
  // covers every UTC offset; each boundary takes at most 28 comparisons.
  function startOfDay(day) {
    let low  = day - 1.5 * DAY_MS;
    let high = day + 1.5 * DAY_MS;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (localDay(mid) < day) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  const start = startOfDay(firstDay);
  // Resolve the next calendar day separately: a DST day need not last 24 hours.
  const end = startOfDay(lastDay + DAY_MS) - 1;
  if (end < start) return null;
  return { startISO: new Date(start).toISOString(), endISO: new Date(end).toISOString(), timeZone };
}
