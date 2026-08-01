// Popup entry: tab switching, the Settings tab (load/save, currency selects,
// live FX rate, widget toggles), and wiring of the other modules.
// The simulator lives in simulator.js, the Invoice tab in invoice-tab.js.
//
// There is no "notify the content script" step: it listens to
// chrome.storage.onChanged, so saving here is enough to re-render widgets.

import { CURRENCIES, CURRENCY_SYMBOLS } from '../shared/currencies.js';
import { SETTINGS_KEYS } from '../shared/settings.js';
import { INVOICE_KEYS } from '../shared/invoice-fields.js';
import { initSimulator, renderSimulation } from './simulator.js';
import { initInvoiceTab, fillInvoiceFields, onInvoiceTabShown } from './invoice-tab.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const paidCurrencyEl        = document.getElementById('paid-currency');
const paidCurrencyDisplayEl = document.getElementById('paid-currency-display');
const receiveCurrencyEl     = document.getElementById('receive-currency');
const hourlyRateEl          = document.getElementById('hourly-rate');
const weekendBonusEl        = document.getElementById('weekend-bonus');
const weekendUnitEl         = document.getElementById('weekend-unit');
const socialChargesEl       = document.getElementById('social-charges');
const profExpenseEl         = document.getElementById('prof-expense');
const taxRateEl             = document.getElementById('tax-rate');
const exchangeRateEl        = document.getElementById('exchange-rate');
const fetchRateBtn          = document.getElementById('fetch-rate-btn');
const rateStatus            = document.getElementById('rate-status');
const rateUnit              = document.getElementById('rate-unit');
const form                  = document.getElementById('settings-form');
const savedMsg              = document.getElementById('saved-msg');

const widgetToggleEls = {
  showDashboard:   document.getElementById('widget-dashboard'),
  showCalendar:    document.getElementById('widget-calendar'),
  showTrackerDay:  document.getElementById('widget-tracker-day'),
  showTrackerWeek: document.getElementById('widget-tracker-week'),
};

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('panel-settings').style.display = tab === 'settings' ? '' : 'none';
    document.getElementById('panel-invoice').style.display  = tab === 'invoice'  ? '' : 'none';
    if (tab === 'invoice') onInvoiceTabShown();
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function populateSelect(el, selected) {
  el.innerHTML = '';
  CURRENCIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (c === selected) opt.selected = true;
    el.appendChild(opt);
  });
}

// ── Init: load stored settings ────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.sync.get([...SETTINGS_KEYS, ...INVOICE_KEYS]);

  const paid    = data.paidCurrency    || 'EUR';
  const receive = data.receiveCurrency || 'EUR';

  populateSelect(paidCurrencyEl, paid);
  populateSelect(paidCurrencyDisplayEl, paid);
  populateSelect(receiveCurrencyEl, receive);

  rateUnit.textContent       = CURRENCY_SYMBOLS[paid] || paid;
  weekendUnitEl.textContent  = CURRENCY_SYMBOLS[paid] || paid;

  if (data.hourlyRate    != null) hourlyRateEl.value    = data.hourlyRate;
  if (data.weekendBonus  != null) weekendBonusEl.value  = data.weekendBonus;
  if (data.socialCharges != null) socialChargesEl.value = data.socialCharges;
  if (data.profExpense   != null) profExpenseEl.value   = data.profExpense;
  if (data.taxRate       != null) taxRateEl.value       = data.taxRate;
  if (data.exchangeRate  != null) exchangeRateEl.value  = data.exchangeRate;

  // Widget toggles default to on when unset (undefined !== false → checked).
  for (const [key, el] of Object.entries(widgetToggleEls)) {
    el.checked = data[key] !== false;
  }

  fillInvoiceFields(data);

  renderSimulation();
}

// Keep the read-only "Paid in" mirror and the rate unit in step.
paidCurrencyEl.addEventListener('change', () => {
  const c = paidCurrencyEl.value;
  populateSelect(paidCurrencyDisplayEl, c);
  rateUnit.textContent      = CURRENCY_SYMBOLS[c] || c;
  weekendUnitEl.textContent = CURRENCY_SYMBOLS[c] || c;
});

// ── Fetch live exchange rate ──────────────────────────────────────────────────

fetchRateBtn.addEventListener('click', async () => {
  const from = paidCurrencyEl.value;
  const to   = receiveCurrencyEl.value;

  if (from === to) {
    exchangeRateEl.value   = '1';
    rateStatus.textContent = 'Same currency — rate set to 1.';
    rateStatus.className   = 'ok';
    renderSimulation();
    return;
  }

  fetchRateBtn.classList.add('loading');
  rateStatus.className   = '';
  rateStatus.textContent = 'Fetching…';

  try {
    const res  = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    const json = await res.json();
    if (json.result !== 'success') throw new Error(json['error-type'] || 'API error');
    const rate = json.rates[to];
    if (rate == null) throw new Error(`Rate for ${to} not found`);
    exchangeRateEl.value   = rate.toFixed(6);
    rateStatus.textContent = `1 ${from} = ${rate.toFixed(4)} ${to}`;
    rateStatus.className   = 'ok';
    renderSimulation();
  } catch (err) {
    rateStatus.textContent = `Error: ${err.message}`;
    rateStatus.className   = 'error';
  } finally {
    fetchRateBtn.classList.remove('loading');
  }
});

// ── Save settings ─────────────────────────────────────────────────────────────

function readWidgetToggles() {
  const out = {};
  for (const [key, el] of Object.entries(widgetToggleEls)) out[key] = el.checked;
  return out;
}

// Widget toggles apply live — persist the moment one flips, no Save needed.
Object.values(widgetToggleEls).forEach(el => {
  el.addEventListener('change', () => {
    chrome.storage.sync.set(readWidgetToggles());
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  await chrome.storage.sync.set({
    hourlyRate:      parseFloat(hourlyRateEl.value)    || 0,
    weekendBonus:    parseFloat(weekendBonusEl.value)  || 0,
    paidCurrency:    paidCurrencyEl.value,
    receiveCurrency: receiveCurrencyEl.value,
    socialCharges:   parseFloat(socialChargesEl.value) || 0,
    profExpense:     parseFloat(profExpenseEl.value)   || 0,
    taxRate:         parseFloat(taxRateEl.value)       || 0,
    exchangeRate:    parseFloat(exchangeRateEl.value)  || 1,
    ...readWidgetToggles(),
  });

  savedMsg.classList.add('visible');
  setTimeout(() => savedMsg.classList.remove('visible'), 3000);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initSimulator();
initInvoiceTab();
init();
