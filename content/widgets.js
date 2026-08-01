// Builders for the injected widgets. Pure DOM construction — no scraping, no
// storage; everything comes in as arguments. Styling lives in content.css.

import { calculate } from '../shared/money.js';
import { fmt, fmtNum, currencyTag, formatHM } from '../shared/format.js';

export const CARD_ID            = 'csc-earnings-card';
export const WEEK_ID            = 'csc-week-widget';
export const TRACKER_WEEK_CLASS = 'csc-tracker-week';
export const DAY_BADGE_CLASS    = 'csc-day-badge';

// The same coin icon on every widget; only the class differs.
function coinSvg(cls) {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>`;
}

// Dashboard earnings card: net/gross, net% badge, progress bar, FX conversion.
//
// weekendKnown is false on the dashboard today: its daily activity chart is a
// <canvas>, so there is no way to tell which of these hours fell on a weekend.
// Rather than quietly bill them all at the base rate, the card says so.
export function buildCard(settings, hours, { weekendHours = 0, weekendKnown = true } = {}) {
  const { paidCurrency, receiveCurrency, exchangeRate, hourlyRate, weekendBonus } = settings;
  const calc = calculate(hours, settings, { weekendHours });
  const { gross, net, weekendAmt } = calc;
  const same    = paidCurrency === receiveCurrency;
  const netPct  = gross > 0 ? Math.round((net / gross) * 100) : 0;
  const hasBonus = weekendBonus > 0;

  const card = document.createElement('div');
  card.id = CARD_ID;

  card.innerHTML = `
    <div class="csc-label">
      ${coinSvg('csc-icon')}
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

    <div class="csc-footer">
      <span>${hours.toFixed(2)} h &times; ${fmt(hourlyRate, paidCurrency)}/h</span>
      ${hasBonus && calc.weekendHours > 0
        ? `<span class="csc-weekend">+${calc.weekendHours.toFixed(2)} h weekend = ${fmt(weekendAmt, paidCurrency)}</span>`
        : ''}
      ${hasBonus && !weekendKnown
        ? '<span class="csc-weekend-unknown" title="The dashboard chart is a canvas, so weekend hours cannot be read here. Open the Time Tracker or Calendar for the weekend-adjusted figure.">weekend bonus not included</span>'
        : ''}
    </div>
  `;

  return card;
}

// Inline pill: hours + net/gross (+ FX). Used as the calendar week recap and,
// with a class override, as the tracker range total.
export function buildWeekWidget(settings, totals, { id = WEEK_ID, cls, label } = {}) {
  const { paidCurrency, receiveCurrency, exchangeRate, hourlyRate, weekendBonus } = settings;
  // weekendHours rides along on `totals` so call sites that only know a plain
  // total (the tracker range pills) keep working unchanged.
  const { hours, days, weekendHours = 0 } = totals;
  const hasRate = hourlyRate > 0;
  const calc = calculate(hours, settings, { weekendHours });
  const { gross, net, weekendAmt } = calc;
  const same  = paidCurrency === receiveCurrency;
  label = label || (days > 1 ? 'This week' : 'This day');

  const widget = document.createElement('div');
  if (id) widget.id = id;
  widget.className = 'csc-week-pill' + (cls ? ' ' + cls : '');

  // Sits inline in Clockify's own toolbar, so width is the binding constraint:
  // too wide and it pushes the date picker onto a second row. The currency is
  // therefore stated once per label rather than repeated on every value, and
  // paid-currency figures are grouped before the converted one.
  const paidTag    = currencyTag(paidCurrency);
  const receiveTag = currencyTag(receiveCurrency);

  widget.innerHTML = `
    ${coinSvg('csc-week-icon')}

    <div class="csc-week-seg">
      <span class="csc-week-lbl">${label}</span>
      <span class="csc-week-hours">${formatHM(hours)}</span>
    </div>

    ${hasRate ? `
    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Net ${paidTag}</span>
      <span class="csc-week-net">${fmtNum(net)}</span>
    </div>

    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Gross</span>
      <span class="csc-week-gross">${fmtNum(gross)}</span>
    </div>

    ${weekendBonus > 0 && calc.weekendHours > 0 ? `
    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Weekend</span>
      <span class="csc-week-we">+${fmtNum(weekendAmt)}</span>
    </div>` : ''}

    ${!same ? `
    <div class="csc-week-div"></div>
    <div class="csc-week-seg">
      <span class="csc-week-lbl">Net ${receiveTag}</span>
      <span class="csc-week-conv">${fmtNum(net * exchangeRate)}</span>
    </div>` : ''}
    ` : ''}
  `;

  return widget;
}

// Compact inline earnings badge appended next to a day's total duration. A day
// is either fully a weekend day or not, so weekendHours is 0 or the day total.
export function buildDayBadge(settings, hours, { weekendHours = 0 } = {}) {
  const { paidCurrency, receiveCurrency, exchangeRate, weekendBonus } = settings;
  const calc = calculate(hours, settings, { weekendHours });
  const { gross, net } = calc;
  const same       = paidCurrency === receiveCurrency;
  const showGross  = Math.abs(gross - net) >= 0.005;

  const badge = document.createElement('span');
  badge.className = DAY_BADGE_CLASS;

  badge.innerHTML = `
    ${coinSvg('csc-day-icon')}
    ${weekendBonus > 0 && calc.weekendHours > 0 ? '<span class="csc-day-we">WE</span>' : ''}
    <span class="csc-day-net">${fmt(net, paidCurrency)}</span>
    ${showGross ? `<span class="csc-day-gross">of ${fmt(gross, paidCurrency)}</span>` : ''}
    ${!same ? `<span class="csc-day-conv">${fmt(net * exchangeRate, receiveCurrency)}</span>` : ''}
  `;

  return badge;
}
