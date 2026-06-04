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

const INVOICE_KEYS = [
  'inv_name','inv_address','inv_city','inv_country','inv_phone','inv_email','inv_siret',
  'inv_clientName','inv_clientAddress','inv_clientCity','inv_clientCountry',
  'inv_bank','inv_swift','inv_iban',
  'inv_opType','inv_paymentDays','inv_legalNote','inv_legalStatus',
  'inv_lastNumber',
];

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
const generateBtn           = document.getElementById('generate-btn');
const invStatus             = document.getElementById('inv-status');

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('panel-settings').style.display = tab === 'settings' ? '' : 'none';
    document.getElementById('panel-invoice').style.display  = tab === 'invoice'  ? '' : 'none';
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

  html += `
    <div class="sim-row">
      <span class="sim-lbl">Gross <span class="badge">${hours} h</span></span>
      <span class="sim-val">${fmt(c.gross, paid)}</span>
    </div>`;

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
        <span class="sim-val" style="color:var(--accent)">${fmt(c.net * c.exchangeRate, receive)}</span>
      </div>
      <div class="sim-converted" style="border-top:none;padding-top:2px">
        <span class="sim-lbl">Gross in ${receive}</span>
        <span class="sim-val" style="color:var(--accent);font-size:11px">${fmt(c.gross * c.exchangeRate, receive)}</span>
      </div>`;
  }

  html += '</div>';
  simBody.innerHTML = html;
}

// ── Invoice settings helpers ──────────────────────────────────────────────────

const INV_FIELD_MAP = {
  'inv_name':            'inv-name',
  'inv_address':         'inv-address',
  'inv_city':            'inv-city',
  'inv_country':         'inv-country',
  'inv_phone':           'inv-phone',
  'inv_email':           'inv-email',
  'inv_siret':           'inv-siret',
  'inv_clientName':      'inv-client-name',
  'inv_clientAddress':   'inv-client-address',
  'inv_clientCity':      'inv-client-city',
  'inv_clientCountry':   'inv-client-country',
  'inv_bank':            'inv-bank',
  'inv_swift':           'inv-swift',
  'inv_iban':            'inv-iban',
  'inv_opType':          'inv-op-type',
  'inv_paymentDays':     'inv-payment-days',
  'inv_legalNote':       'inv-legal-note',
  'inv_legalStatus':     'inv-legal-status',
};

function readInvoiceFields() {
  const data = {};
  for (const [key, id] of Object.entries(INV_FIELD_MAP)) {
    data[key] = document.getElementById(id)?.value || '';
  }
  return data;
}

function fillInvoiceFields(data) {
  for (const [key, id] of Object.entries(INV_FIELD_MAP)) {
    const el = document.getElementById(id);
    if (el && data[key] != null) el.value = data[key];
  }
}

// ── Init: load stored settings ────────────────────────────────────────────────

chrome.storage.sync.get(
  ['hourlyRate', 'paidCurrency', 'receiveCurrency', 'socialCharges', 'profExpense', 'taxRate', 'exchangeRate',
   ...INVOICE_KEYS],
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

    fillInvoiceFields(data);

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

// ── Save settings ─────────────────────────────────────────────────────────────

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

// ── Generate invoice ──────────────────────────────────────────────────────────

function showInvStatus(msg, type = 'ok') {
  invStatus.textContent = msg;
  invStatus.className   = `visible ${type}`;
  if (type === 'ok') setTimeout(() => { invStatus.className = ''; }, 4000);
}

generateBtn.addEventListener('click', async () => {
  generateBtn.classList.add('loading');
  invStatus.className = '';

  try {
    // Save invoice settings first
    const invData = readInvoiceFields();
    await new Promise(r => chrome.storage.sync.set(invData, r));

    // Try to get projects from a Clockify tab (active first, then any open tab)
    let projects = [];
    const [activeTab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const clockifyTabs = await new Promise(r => chrome.tabs.query({ url: 'https://app.clockify.me/*' }, r));

    const clockifyTab = activeTab?.url?.includes('clockify.me')
      ? activeTab
      : clockifyTabs[0] || null;

    if (clockifyTab) {
      try {
        const resp = await chrome.tabs.sendMessage(clockifyTab.id, { type: 'GET_PROJECTS' });
        projects = resp?.projects || [];
      } catch {
        // Content script not ready on this tab
      }
    }

    // Compute next invoice number
    const stored     = await new Promise(r => chrome.storage.sync.get('inv_lastNumber', r));
    const lastNumber = stored.inv_lastNumber || 0;
    const nextNumber = lastNumber + 1;

    const today = new Date().toISOString().split('T')[0];

    // Pack current invoice data for the invoice page
    await new Promise(r => chrome.storage.local.set({
      inv_current: {
        projects,
        date:            today,
        number:          nextNumber,
        rate:            parseFloat(hourlyRateEl.value)   || 0,
        currency:        paidCurrencyEl.value,
        receiveCurrency: receiveCurrencyEl.value,
        bceRate:         parseFloat(exchangeRateEl.value) || 1,
      },
    }, r));

    // Persist incremented number
    await new Promise(r => chrome.storage.sync.set({ inv_lastNumber: nextNumber }, r));

    // Open invoice page
    chrome.tabs.create({ url: chrome.runtime.getURL('invoice/invoice.html') });

    showInvStatus(`Invoice #${nextNumber} generated — tab opened.`);
  } catch (err) {
    showInvStatus(`Error: ${err.message}`, 'error');
  } finally {
    generateBtn.classList.remove('loading');
  }
});
