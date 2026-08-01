// Invoice tab: persist the invoice fields, gather project hours and the weekend
// split from the open Clockify tabs, assign the next invoice number, and open
// the printable page.

import { INVOICE_FIELD_IDS } from '../shared/invoice-fields.js';

const generateBtn   = document.getElementById('generate-btn');
const invStatus     = document.getElementById('inv-status');
const weekendHoursEl = document.getElementById('inv-weekend-hours');
const weekendStatus  = document.getElementById('inv-weekend-status');
const detectBtn      = document.getElementById('inv-detect-weekend');

// ── Field I/O ─────────────────────────────────────────────────────────────────

function readInvoiceFields() {
  const data = {};
  for (const [key, id] of Object.entries(INVOICE_FIELD_IDS)) {
    data[key] = document.getElementById(id)?.value || '';
  }
  return data;
}

export function fillInvoiceFields(data) {
  for (const [key, id] of Object.entries(INVOICE_FIELD_IDS)) {
    const el = document.getElementById(id);
    if (el && data[key] != null) el.value = data[key];
  }
}

function showInvStatus(msg, type = 'ok') {
  invStatus.textContent = msg;
  invStatus.className   = `visible ${type}`;
  if (type === 'ok') setTimeout(() => { invStatus.className = ''; }, 4000);
}

// ── Clockify data ─────────────────────────────────────────────────────────────

// Projects live on the dashboard, the weekend split on the time tracker — two
// different pages. So ask every open Clockify tab and merge, active tab first so
// its project breakdown wins. Returns zeroed/null fields when nothing answers.
async function getClockifyData() {
  const [activeTab]  = await chrome.tabs.query({ active: true, currentWindow: true });
  const clockifyTabs = await chrome.tabs.query({ url: 'https://app.clockify.me/*' });

  const tabs = activeTab?.url?.includes('clockify.me')
    ? [activeTab, ...clockifyTabs.filter((t) => t.id !== activeTab.id)]
    : clockifyTabs;

  const out = { projects: [], weekendHours: null, dayCount: null, range: null, pages: [] };

  for (const tab of tabs) {
    let resp;
    try { resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_INVOICE_DATA' }); }
    catch { continue; } // content script not ready on this tab
    if (!resp) continue;

    out.pages.push(resp.page);
    if (!out.projects.length && resp.projects?.length) out.projects = resp.projects;
    if (out.weekendHours == null && resp.weekendHours != null) {
      out.weekendHours = resp.weekendHours;
      out.dayCount     = resp.dayCount;
      out.range        = resp.range || null;
    }
  }

  return out;
}

// ── Weekend detection ─────────────────────────────────────────────────────────

function showWeekendStatus(msg, type = 'ok') {
  weekendStatus.textContent = msg;
  weekendStatus.className   = `visible ${type}`;
}

async function detectWeekendHours() {
  detectBtn.classList.add('loading');
  try {
    const data = await getClockifyData();

    // null means unknown, never zero — an incomplete scrape must not silently
    // bill zero weekend hours.
    if (data.weekendHours == null) {
      showWeekendStatus(
        data.pages.length
          ? 'Could not establish the day-by-day breakdown. Open your Clockify dashboard on the invoice date range and Detect again — or type the hours manually.'
          : 'No Clockify tab responded. Open Clockify on the invoice date range, then Detect again — or type the hours manually.',
        'error',
      );
      return;
    }

    weekendHoursEl.value = data.weekendHours.toFixed(2);
    showWeekendStatus(
      `Detected ${data.weekendHours.toFixed(2)} h across ${data.dayCount} day(s)` +
      (data.range ? ` — ${data.range}.` : '.')
    );
  } catch (err) {
    showWeekendStatus(`Detection failed: ${err.message} — type the hours manually.`, 'error');
  } finally {
    detectBtn.classList.remove('loading');
  }
}

// Auto-detect the first time the Invoice tab is shown, so the field is
// pre-filled without a click.
let autoDetected = false;
export function onInvoiceTabShown() {
  if (autoDetected) return;
  autoDetected = true;
  detectWeekendHours();
}

// ── Generate ──────────────────────────────────────────────────────────────────

export function initInvoiceTab() {
  detectBtn.addEventListener('click', detectWeekendHours);

  generateBtn.addEventListener('click', async () => {
    generateBtn.classList.add('loading');
    invStatus.className = '';

    try {
      const weekendBonus = parseFloat(document.getElementById('weekend-bonus').value) || 0;
      const rawWeekend   = weekendHoursEl.value.trim();

      // A typed 0 is fine; an empty field is not — with a bonus configured that
      // would silently drop the whole surcharge. Checked on every generate, so
      // clearing the field after a successful detection blocks too.
      if (weekendBonus > 0 && rawWeekend === '') {
        showInvStatus('Enter the weekend hours (or 0) before generating.', 'error');
        return;
      }

      // Save invoice settings first
      await chrome.storage.sync.set(readInvoiceFields());

      const { projects } = await getClockifyData();

      // Compute next invoice number
      const { inv_lastNumber = 0 } = await chrome.storage.sync.get('inv_lastNumber');
      const nextNumber = inv_lastNumber + 1;

      const today = new Date().toISOString().split('T')[0];

      // Pack current invoice data for the invoice page
      await chrome.storage.local.set({
        inv_current: {
          projects,
          date:            today,
          number:          nextNumber,
          rate:            parseFloat(document.getElementById('hourly-rate').value)   || 0,
          weekendHours:    parseFloat(rawWeekend) || 0,
          weekendBonus,
          currency:        document.getElementById('paid-currency').value,
          receiveCurrency: document.getElementById('receive-currency').value,
          bceRate:         parseFloat(document.getElementById('exchange-rate').value) || 1,
        },
      });

      // Persist incremented number
      await chrome.storage.sync.set({ inv_lastNumber: nextNumber });

      // Open invoice page
      chrome.tabs.create({ url: chrome.runtime.getURL('invoice/invoice.html') });

      showInvStatus(`Invoice #${nextNumber} generated — tab opened.`);
    } catch (err) {
      showInvStatus(`Error: ${err.message}`, 'error');
    } finally {
      generateBtn.classList.remove('loading');
    }
  });
}
