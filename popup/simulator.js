// Earnings simulator: live gross→net breakdown for N hours, computed from the
// current form values (saved or not — that's the point of a what-if).

import { calculate } from '../shared/money.js';
import { fmt, fmtPct } from '../shared/format.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const hourlyRateEl      = document.getElementById('hourly-rate');
const socialChargesEl   = document.getElementById('social-charges');
const profExpenseEl     = document.getElementById('prof-expense');
const taxRateEl         = document.getElementById('tax-rate');
const exchangeRateEl    = document.getElementById('exchange-rate');
const paidCurrencyEl    = document.getElementById('paid-currency');
const receiveCurrencyEl = document.getElementById('receive-currency');
const simHoursEl        = document.getElementById('sim-hours');
const simBody           = document.getElementById('sim-body');

function readForm() {
  return {
    hourlyRate:    parseFloat(hourlyRateEl.value)    || 0,
    socialCharges: parseFloat(socialChargesEl.value) || 0,
    profExpense:   parseFloat(profExpenseEl.value)   || 0,
    taxRate:       parseFloat(taxRateEl.value)       || 0,
    exchangeRate:  parseFloat(exchangeRateEl.value)  || 1,
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderSimulation() {
  const s = readForm();
  if (!s.hourlyRate) {
    simBody.innerHTML = '<div id="sim-empty">Configure your hourly rate to see the simulation.</div>';
    return;
  }

  const hours   = parseFloat(simHoursEl.value) || 0;
  const paid    = paidCurrencyEl.value;
  const receive = receiveCurrencyEl.value;
  const same    = paid === receive;
  const c       = calculate(hours, s);
  const netPct  = c.gross > 0 ? (c.net / c.gross) * 100 : 0;

  let html = '<div style="padding:10px 14px 12px">';

  html += `
    <div class="sim-row">
      <span class="sim-lbl">Gross <span class="badge">${hours} h</span></span>
      <span class="sim-val">${fmt(c.gross, paid)}</span>
    </div>`;

  html += '<div class="sim-deductions">';

  if (s.socialCharges > 0) {
    html += `
      <div class="sim-row">
        <span class="sim-lbl">Social charges <span class="badge red">${fmtPct(s.socialCharges)}</span></span>
        <span class="sim-val neg">&#8722;${fmt(c.socialAmt, paid)}</span>
      </div>`;
  }

  if (s.profExpense > 0) {
    html += `
      <div class="sim-row">
        <span class="sim-lbl">Prof. deduction <span class="badge amber">${fmtPct(s.profExpense)}</span></span>
        <span class="sim-val amber">&#8722;${fmt(c.profDeduction, paid)}</span>
      </div>`;
  }

  if (s.taxRate > 0) {
    html += `
      <div class="sim-row">
        <span class="sim-lbl">Income tax <span class="badge red">${fmtPct(s.taxRate)}</span></span>
        <span class="sim-val neg">&#8722;${fmt(c.taxAmt, paid)}</span>
      </div>`;
  }

  html += '</div>';

  html += `
    <hr class="sim-divider" />
    <div class="sim-row">
      <span class="sim-lbl"><strong>Net take-home</strong></span>
      <span class="sim-val green">${fmt(c.net, paid)}</span>
    </div>`;

  html += `
    <div class="sim-bar-wrap">
      <div class="sim-bar-track">
        <div class="sim-bar-fill" style="width:${Math.max(0, Math.min(100, netPct)).toFixed(1)}%"></div>
      </div>
      <span class="sim-bar-label">${netPct.toFixed(1)}% of gross</span>
    </div>`;

  if (!same) {
    html += `
      <div class="sim-converted">
        <span class="sim-lbl">Net in ${receive}</span>
        <span class="sim-val" style="color:var(--accent)">${fmt(c.net * s.exchangeRate, receive)}</span>
      </div>
      <div class="sim-converted" style="border-top:none;padding-top:2px">
        <span class="sim-lbl">Gross in ${receive}</span>
        <span class="sim-val" style="color:var(--accent);font-size:11px">${fmt(c.gross * s.exchangeRate, receive)}</span>
      </div>`;
  }

  html += '</div>';
  simBody.innerHTML = html;
}

// ── Wiring ────────────────────────────────────────────────────────────────────

export function initSimulator() {
  // Any relevant form input re-renders the simulation.
  [hourlyRateEl, socialChargesEl, profExpenseEl, taxRateEl, exchangeRateEl,
   paidCurrencyEl, receiveCurrencyEl, simHoursEl].forEach(el => {
    el.addEventListener('input',  renderSimulation);
    el.addEventListener('change', renderSimulation);
  });

  // Preset buttons (1h / 1d / 1w / 1m).
  document.querySelectorAll('.sim-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sim-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      simHoursEl.value = btn.dataset.h;
      renderSimulation();
    });
  });

  // Typing a custom hour count deselects the presets.
  simHoursEl.addEventListener('input', () => {
    document.querySelectorAll('.sim-preset').forEach(b => b.classList.remove('active'));
  });
}
