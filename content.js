'use strict';

const CARD_ID = 'csc-earnings-card';

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

function tryInject() {
  const timeEl = document.querySelector('[data-cy="total-time"]');
  if (!timeEl) return;

  chrome.storage.sync.get(
    ['hourlyRate', 'paidCurrency', 'receiveCurrency', 'socialCharges', 'profExpense', 'taxRate', 'exchangeRate'],
    (data) => {
      inject(timeEl, {
        hourlyRate:      data.hourlyRate      || 0,
        paidCurrency:    data.paidCurrency    || 'EUR',
        receiveCurrency: data.receiveCurrency || 'EUR',
        socialCharges:   data.socialCharges   || 0,
        profExpense:     data.profExpense      || 0,
        taxRate:         data.taxRate          || 0,
        exchangeRate:    data.exchangeRate     || 1,
      });
    }
  );
}

// ── SPA navigation detection ──────────────────────────────────────────────────

function onNavigate() {
  if (!location.pathname.startsWith('/dashboard')) {
    document.getElementById(CARD_ID)?.remove();
    lastTimeText = '';
    return;
  }
  lastTimeText = '';
  tryInject();
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
let scheduled    = false;

const observer = new MutationObserver(() => {
  if (!location.pathname.startsWith('/dashboard')) return;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const timeEl = document.querySelector('[data-cy="total-time"]');
    if (!timeEl) return;
    const text = timeEl.textContent.trim();
    if (text !== lastTimeText) {
      lastTimeText = text;
      tryInject();
    }
  });
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

if (location.pathname.startsWith('/dashboard')) tryInject();

// ── Settings update from popup ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_UPDATED') {
    lastTimeText = '';
    tryInject();
  }
});
