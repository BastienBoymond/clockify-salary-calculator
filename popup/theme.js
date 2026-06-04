'use strict';

/* ──────────────────────────────────────────────────────────────────────────
   Popup theme: "system" (follow OS preference) | "dark" | "light".

   - localStorage ("csc-theme") is a synchronous mirror, read here in <head>
     before the body paints so the popup never flashes the wrong theme.
   - chrome.storage.sync ("theme") is the persisted, cross-device source of
     truth, written whenever the user changes the header select.
   ────────────────────────────────────────────────────────────────────────── */

const THEME_KEY = 'csc-theme';
const MODES = ['system', 'dark', 'light'];

function prefersDark() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (_) {
    return false;
  }
}

// Resolve a stored mode to the actual theme to paint.
function resolve(mode) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return prefersDark() ? 'dark' : 'light'; // "system"
}

function applyMode(mode) {
  document.documentElement.classList.toggle('csc-dark', resolve(mode) === 'dark');
}

function readMode() {
  try {
    const m = localStorage.getItem(THEME_KEY);
    return MODES.includes(m) ? m : 'system';
  } catch (_) {
    return 'system';
  }
}

// Runs immediately (this script lives in <head>) to avoid a flash of light.
applyMode(readMode());

document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('theme-select');

  function setMode(mode, persist) {
    if (!MODES.includes(mode)) mode = 'system';
    applyMode(mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (_) {}
    if (select) select.value = mode;
    if (persist && chrome?.storage?.sync) chrome.storage.sync.set({ theme: mode });
  }

  // Reflect the mirror the <head> script already applied.
  if (select) select.value = readMode();

  // Reconcile the local mirror with the synced source of truth.
  if (chrome?.storage?.sync) {
    chrome.storage.sync.get('theme', (data) => {
      setMode(MODES.includes(data.theme) ? data.theme : readMode(), false);
    });
  }

  select?.addEventListener('change', () => setMode(select.value, true));

  // Live-update while the popup is open if the OS flips and we're on "system".
  try {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (readMode() === 'system') applyMode('system');
      });
  } catch (_) { /* matchMedia listener unsupported */ }
});
