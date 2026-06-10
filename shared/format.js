// ── Time ─────────────────────────────────────────────────────────────────────

// "H:MM" or "H:MM:SS" → decimal hours.
export function parseTime(text) {
  const parts = (text || '').trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

// Decimal hours → "H:MM" duration, matching how Clockify displays day totals.
export function formatHM(hours) {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ── Money ────────────────────────────────────────────────────────────────────

// Locale-aware currency string, with a plain fallback for unknown codes.
export function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function fmtPct(n) {
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`;
}

// ── French-style numbers (used on the invoice) ───────────────────────────────

// 12345.6 → "12 345,60"
export function fmtFr(num, decimals = 2) {
  const n = Math.abs(num);
  const [int, dec] = n.toFixed(decimals).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intFmt},${dec}`;
}

// "12 345,60" → 12345.6
export function parseFr(str) {
  return parseFloat((str || '0').replace(/[ \s]/g, '').replace(',', '.')) || 0;
}

// ── Dates (ISO "YYYY-MM-DD" ↔ display "DD/MM/YYYY") ──────────────────────────

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Computed in UTC so the result is the same calendar date in every timezone.
export function addDays(iso, days) {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}
