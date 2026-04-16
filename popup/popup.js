'use strict';

const CURRENCIES = [
  'AED','AUD','BGN','BRL','CAD','CHF','CNY','CZK','DKK','EUR',
  'GBP','HKD','HUF','IDR','ILS','INR','JPY','KRW','MXN','MYR',
  'NOK','NZD','PHP','PLN','RON','RUB','SAR','SEK','SGD','THB',
  'TRY','USD','ZAR',
];

const CURRENCY_SYMBOLS = {
  EUR:'€', USD:'$', GBP:'£', JPY:'¥', CHF:'Fr', CAD:'CA$', AUD:'A$',
  CNY:'¥', INR:'₹', KRW:'₩', BRL:'R$', MXN:'$', RUB:'₽', TRY:'₺',
  SEK:'kr', NOK:'kr', DKK:'kr', PLN:'zł', HUF:'Ft', CZK:'Kč',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const paidCurrencyEl        = document.getElementById('paid-currency');
const paidCurrencyDisplayEl = document.getElementById('paid-currency-display');
const receiveCurrencyEl     = document.getElementById('receive-currency');
const hourlyRateEl          = document.getElementById('hourly-rate');
const socialChargesEl       = document.getElementById('social-charges');
const profExpenseEl         = document.getElementById('prof-expense');
const taxRateEl             = document.getElementById('tax-rate');
const exchangeRateEl        = document.getElementById('exchange-rate');
const fetchRateBtn          = document.getElementById('fetch-rate-btn');
const rateStatus            = document.getElementById('rate-status');
const rateUnit              = document.getElementById('rate-unit');
const simHoursEl            = document.getElementById('sim-hours');
const form                  = document.getElementById('settings-form');
const savedMsg              = document.getElementById('saved-msg');
const simBody               = document.getElementById('sim-body');

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

function fmtPct(n) {
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`;
}

function calculate(hours) {
  const rate         = parseFloat(hourlyRateEl.value)    || 0;
  const socialPct    = parseFloat(socialChargesEl.value) || 0;
  const profPct      = parseFloat(profExpenseEl.value)   || 0;
  const taxPct       = parseFloat(taxRateEl.value)       || 0;
  const exchangeRate = parseFloat(exchangeRateEl.value)  || 1;

  const gross         = hours * rate;
  const socialAmt     = gross * (socialPct / 100);
  const afterSocial   = gross - socialAmt;
  const profDeduction = afterSocial * (profPct / 100);
  const taxable       = afterSocial - profDeduction;
  const taxAmt        = taxable * (taxPct / 100);
  const net           = taxable - taxAmt;

  return { gross, socialAmt, profDeduction, taxable, taxAmt, net, exchangeRate,
           socialPct, profPct, taxPct };
}

// ── Simulation ────────────────────────────────────────────────────────────────

function renderSimulation() {
  const rate = parseFloat(hourlyRateEl.value) || 0;
  if (!rate) {
    simBody.innerHTML = '<div id="sim-empty">Configure your hourly rate to see the simulation.</div>';
    return;
  }

  const hours   = parseFloat(simHoursEl.value) || 0;
  const paid    = paidCurrencyEl.value;
  const receive = receiveCurrencyEl.value;
  const same    = paid === receive;
  const c       = calculate(hours);
  const netPct  = c.gross > 0 ? (c.net / c.gross) * 100 : 0;

  let html = '<div style="padding:10px 14px 12px">';

  // Gross
  html += `
    <div class="sim-row">
      <span class="sim-lbl">Gross <span class="badge">${hours} h</span></span>
      <span class="sim-val">${fmt(c.gross, paid)}</span>
    </div>`;

  // Deductions block
  html += '<div class="sim-deductions">';

  if (c.socialPct > 0) {
    html += `
      <div class="sim-row">
        <span class="sim-lbl">Social charges <span class="badge red">${fmtPct(c.socialPct)}</span></span>
        <span class="sim-val neg">&#8722;${fmt(c.socialAmt, paid)}</span>
      </div>`;
  }

  if (c.profPct > 0) {
    html += `
      <div class="sim-row">
        <span class="sim-lbl">Prof. deduction <span class="badge amber">${fmtPct(c.profPct)}</span></span>
        <span class="sim-val amber">&#8722;${fmt(c.profDeduction, paid)}</span>
      </div>`;
  }

  if (c.taxPct > 0) {
    html += `
      <div class="sim-row">
        <span class="sim-lbl">Income tax <span class="badge red">${fmtPct(c.taxPct)}</span></span>
        <span class="sim-val neg">&#8722;${fmt(c.taxAmt, paid)}</span>
      </div>`;
  }

  html += '</div>'; // /sim-deductions

  // Net
  html += `
    <hr class="sim-divider" />
    <div class="sim-row">
      <span class="sim-lbl"><strong>Net take-home</strong></span>
      <span class="sim-val green">${fmt(c.net, paid)}</span>
    </div>`;

  // Bar
  html += `
    <div class="sim-bar-wrap">
      <div class="sim-bar-track">
        <div class="sim-bar-fill" style="width:${Math.max(0, Math.min(100, netPct)).toFixed(1)}%"></div>
      </div>
      <span class="sim-bar-label">${netPct.toFixed(1)}% of gross</span>
    </div>`;

  // Currency conversion
  if (!same) {
    html += `
      <div class="sim-converted">
        <span class="sim-lbl">Net in ${receive}</span>
        <span class="sim-val" style="color:var(--blue-dark)">${fmt(c.net * c.exchangeRate, receive)}</span>
      </div>
      <div class="sim-converted" style="border-top:none;padding-top:2px">
        <span class="sim-lbl">Gross in ${receive}</span>
        <span class="sim-val" style="color:var(--blue-dark);font-size:11px">${fmt(c.gross * c.exchangeRate, receive)}</span>
      </div>`;
  }

  html += '</div>';
  simBody.innerHTML = html;
}

// ── Init: load stored settings ────────────────────────────────────────────────

chrome.storage.sync.get(
  ['hourlyRate', 'paidCurrency', 'receiveCurrency', 'socialCharges', 'profExpense', 'taxRate', 'exchangeRate'],
  (data) => {
    const paid    = data.paidCurrency    || 'EUR';
    const receive = data.receiveCurrency || 'EUR';

    populateSelect(paidCurrencyEl, paid);
    populateSelect(paidCurrencyDisplayEl, paid);
    populateSelect(receiveCurrencyEl, receive);

    rateUnit.textContent = CURRENCY_SYMBOLS[paid] || paid;

    if (data.hourlyRate    != null) hourlyRateEl.value    = data.hourlyRate;
    if (data.socialCharges != null) socialChargesEl.value = data.socialCharges;
    if (data.profExpense   != null) profExpenseEl.value   = data.profExpense;
    if (data.taxRate       != null) taxRateEl.value       = data.taxRate;
    if (data.exchangeRate  != null) exchangeRateEl.value  = data.exchangeRate;

    renderSimulation();
  }
);

// ── Reactivity ────────────────────────────────────────────────────────────────

[hourlyRateEl, socialChargesEl, profExpenseEl, taxRateEl, exchangeRateEl,
 paidCurrencyEl, receiveCurrencyEl, simHoursEl].forEach(el => {
  el.addEventListener('input',  renderSimulation);
  el.addEventListener('change', renderSimulation);
});

paidCurrencyEl.addEventListener('change', () => {
  const c = paidCurrencyEl.value;
  populateSelect(paidCurrencyDisplayEl, c);
  rateUnit.textContent = CURRENCY_SYMBOLS[c] || c;
});

// ── Simulation preset buttons ─────────────────────────────────────────────────

document.querySelectorAll('.sim-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sim-preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    simHoursEl.value = btn.dataset.h;
    renderSimulation();
  });
});

simHoursEl.addEventListener('input', () => {
  document.querySelectorAll('.sim-preset').forEach(b => b.classList.remove('active'));
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

// ── Save ──────────────────────────────────────────────────────────────────────

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const settings = {
    hourlyRate:      parseFloat(hourlyRateEl.value)    || 0,
    paidCurrency:    paidCurrencyEl.value,
    receiveCurrency: receiveCurrencyEl.value,
    socialCharges:   parseFloat(socialChargesEl.value) || 0,
    profExpense:     parseFloat(profExpenseEl.value)   || 0,
    taxRate:         parseFloat(taxRateEl.value)       || 0,
    exchangeRate:    parseFloat(exchangeRateEl.value)  || 1,
  };

  chrome.storage.sync.set(settings, () => {
    savedMsg.classList.add('visible');
    setTimeout(() => savedMsg.classList.remove('visible'), 3000);

    chrome.tabs.query({ url: 'https://app.clockify.me/dashboard*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
      });
    });
  });
});
