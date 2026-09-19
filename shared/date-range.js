// Clockify interprets its API date filters as account-local calendar times,
// even though their required wire format ends in Z. Response timestamps, on
// the other hand, are UTC instants and need the account timezone for grouping.
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

// Date-only labels ("Sep 1, 2026" or "2026-09-01") → inclusive local API bounds.
// Do not apply a timezone offset: Clockify applies it when reading the filters.
// https://forum.clockify.me/t/start-parameter-for-time-entries-endpoint-not-utc/776
export function dateRangeBounds(startLabel, endLabel, timeZone) {
  // Parse calendar fields in UTC so neither date can shift with the browser's
  // timezone. UTC is only a formatting device here; these are wall-clock dates.
  const firstDay = Date.parse(`${startLabel} UTC`);
  const lastDay  = Date.parse(`${endLabel} UTC`);
  if (!Number.isFinite(firstDay) || !Number.isFinite(lastDay) || firstDay > lastDay) return null;

  return {
    apiStart: new Date(firstDay).toISOString(),
    apiEnd:   new Date(lastDay + DAY_MS - 1).toISOString(),
    timeZone: resolveTimeZone(timeZone),
  };
}
