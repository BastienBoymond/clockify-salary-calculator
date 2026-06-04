'use strict';

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('popup/vendor/pdf.worker.min.js');

// ── DOM refs ──────────────────────────────────────────────────────────────────

const importBtn    = document.getElementById('import-pdf-btn');
const importInput  = document.getElementById('import-pdf-input');
const importStatus = document.getElementById('import-status');

const FIELD_TO_DOM = {
  inv_name:          'inv-name',
  inv_address:       'inv-address',
  inv_city:          'inv-city',
  inv_country:       'inv-country',
  inv_phone:         'inv-phone',
  inv_email:         'inv-email',
  inv_siret:         'inv-siret',
  inv_clientName:    'inv-client-name',
  inv_clientAddress: 'inv-client-address',
  inv_clientCity:    'inv-client-city',
  inv_clientCountry: 'inv-client-country',
  inv_bank:          'inv-bank',
  inv_swift:         'inv-swift',
  inv_iban:          'inv-iban',
  inv_opType:        'inv-op-type',
  inv_paymentDays:   'inv-payment-days',
  inv_legalNote:     'inv-legal-note',
  inv_legalStatus:   'inv-legal-status',
};

function showStatus(msg, type = '') {
  importStatus.textContent = msg;
  importStatus.className   = type;
}

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractItems(pdfDoc) {
  const items = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page     = await pdfDoc.getPage(p);
    const content  = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    for (const it of content.items) {
      if (!it.str) continue;
      items.push({
        str:   it.str,
        x:     it.transform[4],
        y:     it.transform[5],
        page:  p,
        pageW: viewport.width,
      });
    }
  }
  return items;
}

// Group items into rows (same baseline within yTol).
function groupRows(items, yTol = 3) {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y);
  const rows = [];
  let cur = null;
  for (const it of sorted) {
    if (cur && it.page === cur.page && Math.abs(it.y - cur.y) <= yTol) {
      cur.items.push(it);
    } else {
      cur = { page: it.page, y: it.y, pageW: it.pageW, items: [it] };
      rows.push(cur);
    }
  }
  return rows;
}

const collapse = s => s.replace(/\s+/g, ' ').trim();

function rowToFullText(row) {
  const sorted = [...row.items].sort((a, b) => a.x - b.x);
  return collapse(sorted.map(i => i.str).join(''));
}

function rowToColumns(row) {
  const midX  = row.pageW / 2;
  const left  = row.items.filter(i => i.x <  midX).sort((a, b) => a.x - b.x);
  const right = row.items.filter(i => i.x >= midX).sort((a, b) => a.x - b.x);
  return {
    L: collapse(left .map(i => i.str).join('')),
    R: collapse(right.map(i => i.str).join('')),
  };
}

// ── Field shape detectors ─────────────────────────────────────────────────────

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Phone: starts with + or digit, then ≥8 chars made of digits and separators only.
const RE_PHONE = /^[+\d][\d\s.()\-]{7,}$/;

const HEADER_META_PATTERNS = [
  /^(FACTURE|INVOICE)\b/i,
  /(Date de facturation|Invoice date)/i,
  /([ÉE]ch[ée]ance|Due date)/i,
  /(P[ée]riode|Period)/i,
  /(Type d[' ]?op[ée]ration|Operation type)/i,
];

// ── Parser ────────────────────────────────────────────────────────────────────

function parse(rows) {
  const out = {};

  const fullTexts = rows.map(rowToFullText);

  // Find table header row & SIRET row using full-row text.
  const tableIdx = fullTexts.findIndex(t =>
    /Description/i.test(t) && /(Qt[ée]|Quantit|Qty)/i.test(t)
  );
  const siretIdx = fullTexts.findIndex(t => /SIRET/i.test(t));

  // 1. Parties block (above table): column-split each row.
  const partiesRows = tableIdx > 0 ? rows.slice(0, tableIdx) : rows;
  const leftLines = [];
  const rightLines = [];
  for (const row of partiesRows) {
    const full = rowToFullText(row);
    // Strip header-meta rows (and capture op-type while we're here).
    let isMeta = false;
    for (const re of HEADER_META_PATTERNS) {
      if (re.test(full)) {
        isMeta = true;
        const m = full.match(/(?:Type d[' ]?op[ée]ration|Operation type)\s*:?\s*(.+)/i);
        if (m && m[1]) out.inv_opType = m[1].trim();
        break;
      }
    }
    if (isMeta) continue;
    const { L, R } = rowToColumns(row);
    if (L) leftLines.push(L);
    if (R) rightLines.push(R);
  }

  const dedupe = arr => arr.filter((v, i) => i === 0 || v !== arr[i - 1]);

  // 2. Freelancer (left): pull email + phone by shape, rest is name/addr/city/country.
  const leftClean = dedupe(leftLines);
  const remaining = [];
  for (const t of leftClean) {
    if (!out.inv_email && RE_EMAIL.test(t)) {
      out.inv_email = t.match(RE_EMAIL)[0];
      continue;
    }
    if (!out.inv_phone && RE_PHONE.test(t)) {
      out.inv_phone = t;
      continue;
    }
    remaining.push(t);
  }
  if (remaining[0]) out.inv_name    = remaining[0];
  if (remaining[1]) out.inv_address = remaining[1];
  if (remaining[2]) out.inv_city    = remaining[2];
  if (remaining[3]) out.inv_country = remaining[3];

  // 3. Client (right)
  const rightClean = dedupe(rightLines);
  if (rightClean[0]) out.inv_clientName    = rightClean[0];
  if (rightClean[1]) out.inv_clientAddress = rightClean[1];
  if (rightClean[2]) out.inv_clientCity    = rightClean[2];
  if (rightClean[3]) out.inv_clientCountry = rightClean[3];

  // 4. Labeled fields anywhere on the page — use full-row text so centered/wide
  //    rows aren't split across the column midline.
  for (const t of fullTexts) {
    let m;
    if (!out.inv_bank        && (m = t.match(/(?:Banque|Bank)\s*:\s*(.+?)(?:\s+SWIFT|\s+IBAN|$)/i))) out.inv_bank      = m[1].trim();
    if (!out.inv_swift       && (m = t.match(/SWIFT(?:\/BIC)?\s*:\s*([^\s].*?)(?:\s+IBAN|$)/i))) out.inv_swift   = m[1].trim();
    if (!out.inv_iban        && (m = t.match(/IBAN\s*:\s*(.+)/i)))                            out.inv_iban        = m[1].trim();
    if (!out.inv_paymentDays && (m = t.match(/(\d+)\s*(?:jours?|days?)/i)))                    out.inv_paymentDays = m[1];
    if (!out.inv_siret       && (m = t.match(/SIRET[^:]*:\s*([\d\s]+?)(?:\s*$|[^\d\s])/i)))   out.inv_siret       = m[1].trim();
    if (!out.inv_legalNote   && /(?:TVA\s+non\s+applicable|VAT\s+not\s+applicable)/i.test(t))  out.inv_legalNote   = t;
  }

  // 5. Legal status: footer row containing " — " just above the SIRET row.
  if (siretIdx >= 0) {
    for (let i = siretIdx - 1; i >= Math.max(0, siretIdx - 3); i--) {
      const t = fullTexts[i];
      const m = t.match(/^(.+?)\s+[—–\-]\s+(.+)$/);
      if (m && !/:/.test(t)) {
        out.inv_legalStatus = m[2].trim();
        break;
      }
    }
  }

  return out;
}

// ── Apply to form + persist ───────────────────────────────────────────────────

async function applyData(data) {
  let filled = 0;
  const toSave = {};
  for (const [key, id] of Object.entries(FIELD_TO_DOM)) {
    if (data[key] == null || data[key] === '') continue;
    const el = document.getElementById(id);
    if (el) {
      el.value = data[key];
      filled++;
    }
    toSave[key] = data[key];
  }
  if (Object.keys(toSave).length > 0) {
    await new Promise(r => chrome.storage.sync.set(toSave, r));
  }
  return filled;
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function importPdf(file) {
  showStatus('Reading PDF…');
  const buf    = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const items  = await extractItems(pdfDoc);
  const rows   = groupRows(items);
  const data   = parse(rows);
  const n      = await applyData(data);
  showStatus(
    n > 0 ? `${n} field${n > 1 ? 's' : ''} imported and saved.`
          : 'No fields detected.',
    n > 0 ? 'ok' : 'error',
  );
}

importBtn.addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  importBtn.classList.add('loading');
  try {
    await importPdf(file);
  } catch (err) {
    console.error(err);
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    importBtn.classList.remove('loading');
    importInput.value = '';
  }
});
