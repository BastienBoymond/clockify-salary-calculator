// Invoice tab: persist the invoice fields, gather project hours from an open
// Clockify tab, assign the next invoice number, and open the printable page.

import { INVOICE_FIELD_IDS } from '../shared/invoice-fields.js';

const generateBtn = document.getElementById('generate-btn');
const invStatus   = document.getElementById('inv-status');

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

// ── Project hours from Clockify ───────────────────────────────────────────────

// Ask a Clockify tab (active first, then any open one) for its project
// breakdown. Returns [] when no tab or no content script is reachable.
async function getProjectsFromClockifyTab() {
  const [activeTab]  = await chrome.tabs.query({ active: true, currentWindow: true });
  const clockifyTabs = await chrome.tabs.query({ url: 'https://app.clockify.me/*' });

  const tab = activeTab?.url?.includes('clockify.me') ? activeTab : clockifyTabs[0];
  if (!tab) return [];

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROJECTS' });
    return resp?.projects || [];
  } catch {
    return []; // content script not ready on this tab
  }
}

// ── Generate ──────────────────────────────────────────────────────────────────

export function initInvoiceTab() {
  generateBtn.addEventListener('click', async () => {
    generateBtn.classList.add('loading');
    invStatus.className = '';

    try {
      // Save invoice settings first
      await chrome.storage.sync.set(readInvoiceFields());

      const projects = await getProjectsFromClockifyTab();

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
