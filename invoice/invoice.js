'use strict';

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtFr(num, decimals = 2) {
  const n = Math.abs(num);
  const [int, dec] = n.toFixed(decimals).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intFmt},${dec}`;
}

const CURRENCY_LABELS = {
  USD: '$US', EUR: '€', GBP: '£', CHF: 'CHF',
  CAD: 'CA$', AUD: 'A$', JPY: '¥', CNY: '¥',
};

function fmtCurrency(amount, curr) {
  const label = CURRENCY_LABELS[curr] || curr;
  return `${fmtFr(amount)} ${label}`;
}

function parseFr(str) {
  return parseFloat((str || '0').replace(/[ \s]/g, '').replace(',', '.')) || 0;
}

function parseTime(text) {
  const parts = (text || '').trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

function toISODate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function addDays(iso, days) {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().split('T')[0];
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
    totalHours += qty;
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

function addRow({ name = '', date = '', hours = 0, price = 0 } = {}) {
  const tbody = document.getElementById('items-body');
  const tr    = document.createElement('tr');
  tr.className = 'item-row';

  // Round hours to 2 decimals
  const hoursStr = hours > 0 ? fmtFr(Math.round(hours * 100) / 100) : '0,00';

  tr.innerHTML = `
    <td class="item-desc" contenteditable>${name || 'Description'}</td>
    <td class="item-date td-date" contenteditable>${date}</td>
    <td class="item-qty td-qty" contenteditable>${hoursStr}</td>
    <td class="item-unit td-unit" contenteditable>h</td>
    <td class="item-price td-price" contenteditable>${fmtFr(price)}</td>
    <td class="item-amount td-amount">${fmtCurrency(hours * price, invoiceCurrency)}</td>
    <td class="td-actions no-print"><button class="remove-btn" title="Supprimer">×</button></td>
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
  const [local, sync] = await Promise.all([
    new Promise(r => chrome.storage.local.get('inv_current', d => r(d.inv_current || {}))),
    new Promise(r => chrome.storage.sync.get(null, r)),
  ]);

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

  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                     'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const d = new Date(today + 'T00:00:00');
  const period = `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;

  // Toolbar
  document.getElementById('toolbar-title-num').textContent = `${year}-${num} — ${period}`;
  document.title = `FACTURE-${year}-${num} ${period}`;

  // Header
  set('inv-number',  `${year}-${num}`);
  set('inv-date',    fmtDate(today));
  set('inv-due',     fmtDate(due));
  set('inv-period',  period);
  set('inv-op-type', sync.inv_opType || 'Prestation de services');

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
  set('inv-legal-note',   sync.inv_legalNote   || 'TVA non applicable - art. 259-1 du CGI');
  set('inv-footer-name',   sync.inv_name        || '');
  set('inv-footer-status', sync.inv_legalStatus || 'Entrepreneur individuel');
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
