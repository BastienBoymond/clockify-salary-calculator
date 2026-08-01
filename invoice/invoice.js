// Printable invoice page. Reads the one-shot payload the popup stored in
// chrome.storage.local (inv_current) plus the persisted invoice settings in
// sync storage, renders the document, and keeps totals live while the user
// edits the contenteditable fields.

import { CURRENCY_LABELS } from '../shared/currencies.js';
import { parseTime, fmtFr, parseFr, fmtDate, addDays } from '../shared/format.js';

function fmtCurrency(amount, curr) {
  const label = CURRENCY_LABELS[curr] || curr;
  return `${fmtFr(amount)} ${label}`;
}

// ── State ─────────────────────────────────────────────────────────────────────

let invoiceCurrency = 'USD';
let bceRate = 1;

// ── Totals ────────────────────────────────────────────────────────────────────

function updateTotals() {
  let total = 0;
  let totalHours = 0;

  document.querySelectorAll('.item-row').forEach(row => {
    const qty   = parseFr(row.querySelector('.item-qty').textContent);
    const price = parseFr(row.querySelector('.item-price').textContent);
    const amt   = qty * price;
    row.querySelector('.item-amount').textContent = fmtCurrency(amt, invoiceCurrency);
    // Surcharge rows bill hours that the project rows already counted, so their
    // amount counts toward the money total but their hours must not.
    if (!row.classList.contains('item-row-extra')) totalHours += qty;
    total += amt;
  });

  const totalStr = fmtCurrency(total, invoiceCurrency);
  document.getElementById('total-hours').textContent = `${fmtFr(totalHours)} h`;
  document.getElementById('total-ht').textContent  = totalStr;
  document.getElementById('total-ttc').textContent = totalStr;

  // Update BCE euro equivalent
  const bceSection = document.getElementById('bce-section');
  if (bceSection.style.display !== 'none' && bceRate > 0) {
    document.getElementById('inv-total-eur').textContent = fmtFr(total * bceRate);
  }
}

// ── Row management ────────────────────────────────────────────────────────────

function addRow({ name = '', date = '', hours = 0, price = 0, countHours = true } = {}) {
  const tbody = document.getElementById('items-body');
  const tr    = document.createElement('tr');
  tr.className = 'item-row' + (countHours ? '' : ' item-row-extra');

  // Round hours to 2 decimals
  const hoursStr = hours > 0 ? fmtFr(Math.round(hours * 100) / 100) : '0,00';

  tr.innerHTML = `
    <td class="item-desc" contenteditable>${name || 'Description'}</td>
    <td class="item-date td-date" contenteditable>${date}</td>
    <td class="item-qty td-qty" contenteditable>${hoursStr}</td>
    <td class="item-unit td-unit" contenteditable>h</td>
    <td class="item-price td-price" contenteditable>${fmtFr(price)}</td>
    <td class="item-amount td-amount">${fmtCurrency(hours * price, invoiceCurrency)}</td>
    <td class="td-actions no-print"><button class="remove-btn" title="Remove">×</button></td>
  `;

  tr.querySelector('.remove-btn').addEventListener('click', () => {
    tr.remove();
    updateTotals();
  });

  tr.querySelector('.item-qty').addEventListener('input', updateTotals);
  tr.querySelector('.item-price').addEventListener('input', updateTotals);

  tbody.appendChild(tr);
  updateTotals();
  return tr;
}

// ── Load & render ─────────────────────────────────────────────────────────────

async function loadAndRender() {
  const [localData, sync] = await Promise.all([
    chrome.storage.local.get('inv_current'),
    chrome.storage.sync.get(null),
  ]);
  const local = localData.inv_current || {};

  invoiceCurrency = local.currency || sync.paidCurrency || 'USD';
  bceRate         = local.bceRate  || 1;

  const today   = local.date || new Date().toISOString().split('T')[0];
  const payDays = parseInt(sync.inv_paymentDays) || 30;
  const due     = addDays(today, payDays);
  const year    = today.split('-')[0];
  const num     = local.number || 1;

  function set(id, val) {
    const el = document.getElementById(id);
    if (el && val != null) el.textContent = String(val);
  }

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const d = new Date(today + 'T00:00:00');
  const period = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

  // Toolbar
  document.getElementById('toolbar-title-num').textContent = `${year}-${num} — ${period}`;
  document.title = `INVOICE-${year}-${num} ${period}`;

  // Header
  set('inv-number',  `${year}-${num}`);
  set('inv-date',    fmtDate(today));
  set('inv-due',     fmtDate(due));
  set('inv-period',  period);
  set('inv-op-type', sync.inv_opType || 'Provision of services');

  // Freelancer
  set('inv-name',      sync.inv_name || '');
  set('inv-name-full', sync.inv_name || '');
  set('inv-addr',      sync.inv_address || '');
  set('inv-city',      sync.inv_city || '');
  set('inv-country',   sync.inv_country || '');
  set('inv-phone',     sync.inv_phone || '');
  set('inv-email',     sync.inv_email || '');

  // Client
  set('inv-client-name',    sync.inv_clientName    || '');
  set('inv-client-addr',    sync.inv_clientAddress || '');
  set('inv-client-city',    sync.inv_clientCity    || '');
  set('inv-client-country', sync.inv_clientCountry || '');

  // BCE section
  const receiveCurr = local.receiveCurrency || sync.receiveCurrency || invoiceCurrency;
  const bceSection  = document.getElementById('bce-section');
  if (bceRate !== 1 && invoiceCurrency !== receiveCurr) {
    bceSection.style.display = '';
    set('inv-bce-pair', `${invoiceCurrency}-${receiveCurr}`);
    set('inv-bce-rate', fmtFr(bceRate, 6));
  }

  // Listen for manual BCE rate changes
  document.getElementById('inv-bce-rate').addEventListener('input', () => {
    bceRate = parseFr(document.getElementById('inv-bce-rate').textContent);
    updateTotals();
  });

  // Payment
  set('inv-bank',     sync.inv_bank  || '');
  set('inv-swift',    sync.inv_swift || '');
  set('inv-iban',     sync.inv_iban  || '');
  set('inv-pay-days', payDays);

  // Legal / footer
  set('inv-legal-note',   sync.inv_legalNote   || 'VAT not applicable - art. 259-1 of the French Tax Code');
  set('inv-footer-name',   sync.inv_name        || '');
  set('inv-footer-status', sync.inv_legalStatus || 'Sole proprietor');
  set('inv-footer-addr',
    [sync.inv_address, sync.inv_city, sync.inv_country].filter(Boolean).join(' ')
  );
  set('inv-siret', sync.inv_siret || '');

  // Line items
  const rate     = local.rate || 0;
  const projects = local.projects || [];
  const dateStr  = fmtDate(today);

  if (projects.length > 0) {
    projects.forEach(p => {
      // p.hours may be 0 if serialization lost the value — fall back to parsing timeText
      const hours = p.hours > 0 ? p.hours : parseTime(p.timeText);
      addRow({ name: p.name, date: dateStr, hours, price: rate });
    });
  } else {
    addRow({ date: dateStr, price: rate });
  }

  // Weekend surcharge: the EXTRA per hour on top of the base rate, on its own
  // line so the project rows stay at the plain hourly rate.
  const weekendHours = local.weekendHours || 0;
  const weekendBonus = local.weekendBonus ?? sync.weekendBonus ?? 0;
  if (weekendHours > 0 && weekendBonus > 0) {
    addRow({
      name: 'Weekend surcharge (Sat/Sun)',
      date: dateStr,
      hours: weekendHours,
      price: weekendBonus,
      countHours: false,
    });
  }

  updateTotals();
}

// ── Events ────────────────────────────────────────────────────────────────────

document.getElementById('print-btn').addEventListener('click', () => window.print());

document.getElementById('add-line-btn').addEventListener('click', () => {
  const dateEl = document.getElementById('inv-date');
  addRow({ date: dateEl.textContent });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

loadAndRender().catch(console.error);
