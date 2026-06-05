'use strict';

const CARD_ID = 'csc-earnings-card';
const WEEK_ID = 'csc-week-widget';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTime(text) {
  const parts = text.trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// Decimal hours → "H:MM" duration, matching how Clockify displays day totals.
function formatHM(hours) {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function calculate(hours, s) {
  const gross         = hours * s.hourlyRate;
  const socialAmt     = gross * (s.socialCharges / 100);
  const afterSocial   = gross - socialAmt;
  const profDeduction = afterSocial * (s.profExpense / 100);
  const taxable       = afterSocial - profDeduction;
  const taxAmt        = taxable * (s.taxRate / 100);
  const net           = taxable - taxAmt;
  return { gross, net };
}

// ── Card HTML ─────────────────────────────────────────────────────────────────

function buildCard(settings, hours) {
  const { paidCurrency, receiveCurrency, exchangeRate, hourlyRate } = settings;
  const { gross, net } = calculate(hours, settings);
  const same    = paidCurrency === receiveCurrency;
  const netPct  = gross > 0 ? Math.round((net / gross) * 100) : 0;

  const card = document.createElement('div');
  card.id = CARD_ID;

  card.innerHTML = `
    <div class="csc-label">
      <svg class="csc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      Earnings
    </div>

    <div class="csc-main-row">
      <div>
        <div class="csc-net">${fmt(net, paidCurrency)}</div>
        <div class="csc-gross">of ${fmt(gross, paidCurrency)} gross</div>
      </div>
      <div class="csc-pct-badge">${netPct}%</div>
    </div>

    <div class="csc-bar-track">
      <div class="csc-bar-fill" style="width:${Math.min(100, netPct)}%"></div>
    </div>

    ${!same ? `
    <div class="csc-convert-row">
      <div class="csc-convert-item">
        <span class="csc-convert-lbl">Net ${receiveCurrency}</span>
        <span class="csc-convert-val">${fmt(net * exchangeRate, receiveCurrency)}</span>
      </div>
      <div class="csc-convert-item">
        <span class="csc-convert-lbl">Gross ${receiveCurrency}</span>
        <span class="csc-convert-val csc-convert-muted">${fmt(gross * exchangeRate, receiveCurrency)}</span>
      </div>
    </div>
    ` : ''}

    <div class="csc-footer">${hours.toFixed(2)} h &times; ${fmt(hourlyRate, paidCurrency)}/h</div>
  `;

  return card;
}

// ── Injection ─────────────────────────────────────────────────────────────────

function inject(timeEl, settings) {
  document.getElementById(CARD_ID)?.remove();

  if (!settings.hourlyRate) return;

  const hours      = parseTime(timeEl.textContent);
  const headerItem = timeEl.closest('.cl-dashboard-card-header-item');
  if (!headerItem) return;

  const card = buildCard(settings, hours);
  headerItem.insertAdjacentElement('afterend', card);
}

function getSettings(cb) {
  chrome.storage.sync.get(
    ['hourlyRate', 'paidCurrency', 'receiveCurrency', 'socialCharges', 'profExpense', 'taxRate', 'exchangeRate'],
    (data) => cb({
      hourlyRate:      data.hourlyRate      || 0,
      paidCurrency:    data.paidCurrency    || 'EUR',
      receiveCurrency: data.receiveCurrency || 'EUR',
      socialCharges:   data.socialCharges   || 0,
      profExpense:     data.profExpense      || 0,
      taxRate:         data.taxRate          || 0,
      exchangeRate:    data.exchangeRate     || 1,
    })
  );
}

function tryInject() {
  const timeEl = document.querySelector('[data-cy="total-time"]');
  if (!timeEl) return;
  getSettings((settings) => inject(timeEl, settings));
}

// ── Calendar week widget ────────────────────────────────────────────────────────

const TIME_RE = /^\d{1,2}:\d{2}:\d{2}$/;

// Sum the per-day totals shown in each calendar day header. Each <day-header>
// holds a day label and an "HH:MM:SS" total; we read only the total, never the
// per-event durations inside the grid, so nothing is double-counted.
// Returns { hours, days } or null when the calendar grid hasn't rendered yet.
function getWeekTotals() {
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
function weekSignature() {
  const headers = document.querySelectorAll('day-header');
  if (!headers.length) return '';
  return [...headers].map((h) => h.textContent.trim()).join('|');
}

function buildWeekWidget(settings, totals) {
  const { paidCurrency, receiveCurrency, exchangeRate, hourlyRate } = settings;
  const { hours, days } = totals;
  const hasRate = hourlyRate > 0;
  const { gross, net } = calculate(hours, settings);
  const same  = paidCurrency === receiveCurrency;
  const label = days > 1 ? 'This week' : 'This day';

  const widget = document.createElement('div');
  widget.id = WEEK_ID;

  widget.innerHTML = `
    <svg class="csc-week-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>

    <div class="csc-week-seg">
      <span class="csc-week-lbl">${label}</span>
      <span class="csc-week-hours">${formatHM(hours)}</span>
    </div>

    ${hasRate ? `
    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Net</span>
      <span class="csc-week-net">${fmt(net, paidCurrency)}</span>
    </div>

    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Gross</span>
      <span class="csc-week-gross">${fmt(gross, paidCurrency)}</span>
    </div>

    ${!same ? `
    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Net ${receiveCurrency}</span>
      <span class="csc-week-conv">${fmt(net * exchangeRate, receiveCurrency)}</span>
    </div>` : ''}
    ` : ''}
  `;

  return widget;
}

function injectWeek(settings) {
  document.getElementById(WEEK_ID)?.remove();

  const totals = getWeekTotals();
  if (!totals) return;

  // Sit inline, right after the Calendar / Week / Day button group.
  const switchCal = document.querySelector('switch-calendar');
  if (!switchCal) return;

  switchCal.insertAdjacentElement('afterend', buildWeekWidget(settings, totals));
}

function tryInjectWeek() {
  if (!document.querySelector('switch-calendar')) return;
  if (!document.querySelector('day-header')) return;
  getSettings(injectWeek);
}

// ── SPA navigation detection ──────────────────────────────────────────────────

function isDashboard() { return location.pathname.startsWith('/dashboard'); }
function isCalendar()  { return location.pathname.startsWith('/calendar'); }

function onNavigate() {
  if (!isDashboard()) document.getElementById(CARD_ID)?.remove();
  if (!isCalendar())  document.getElementById(WEEK_ID)?.remove();
  lastTimeText = '';
  lastWeekKey  = '';
  if (isDashboard()) tryInject();
  if (isCalendar())  tryInjectWeek();
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

let lastTimeText = '';
let lastWeekKey  = '';
let scheduled    = false;

const observer = new MutationObserver(() => {
  if (!isDashboard() && !isCalendar()) return;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (isDashboard()) {
      const timeEl = document.querySelector('[data-cy="total-time"]');
      if (!timeEl) return;
      const text = timeEl.textContent.trim();
      if (text !== lastTimeText) {
        lastTimeText = text;
        tryInject();
      }
    } else if (isCalendar()) {
      const key = weekSignature();
      if (key && key !== lastWeekKey) {
        lastWeekKey = key;
        tryInjectWeek();
      }
    }
  });
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

if (isDashboard()) tryInject();
if (isCalendar())  tryInjectWeek();

// ── Project extraction ────────────────────────────────────────────────────────

function extractProjects() {
  const results = [];

  // Clockify dashboard renders a horizontal bar chart table for the project breakdown.
  // Each <tr> has the project name in a span[title] and the duration in td.cl-w-10 > span.
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

// ── Settings update from popup ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SETTINGS_UPDATED') {
    lastTimeText = '';
    lastWeekKey  = '';
    if (isDashboard()) tryInject();
    if (isCalendar())  tryInjectWeek();
  }
  if (msg.type === 'GET_PROJECTS') {
    sendResponse({ projects: extractProjects() });
  }
});
