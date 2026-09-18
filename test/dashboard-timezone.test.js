import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const LABEL = 'Sep 1, 2026 - Sep 30, 2026';
const entry = (start, end, duration) => ({ timeInterval: { start, end, duration } });
const ENTRIES = [
  entry('2026-08-31T21:00:00Z', '2026-08-31T21:30:00Z', 'PT30M'), // August in Paris
  entry('2026-09-01T04:00:00Z', '2026-09-01T05:00:00Z', 'PT1H'),  // September in Paris, August in LA
  entry('2026-09-04T22:00:00Z', '2026-09-05T00:00:00Z', 'PT2H'),  // Saturday in Paris, Friday in LA
  entry('2026-09-30T20:00:00Z', '2026-09-30T21:00:00Z', 'PT1H'),
  entry('2026-09-30T22:00:00Z', '2026-09-30T23:30:00Z', 'PT1H30M'), // October in Paris
];

let card;
let fetchEntries;
let messageListener;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  card = null;

  const totalEl = {
    textContent: '4:00:00',
    closest: () => ({ insertAdjacentElement: (_position, element) => { card = element; } }),
  };
  vi.stubGlobal('document', {
    body: {},
    querySelector: (selector) => selector === '[data-cy="total-time"]' ? totalEl : null,
    querySelectorAll: (selector) => selector === 'datepicker-range .cl-d-print-block'
      ? [{ textContent: LABEL }] : [],
    getElementById: () => card,
    createElement: () => ({ remove: () => { card = null; } }),
    addEventListener: vi.fn(),
  });
  vi.stubGlobal('location', { pathname: '/dashboard' });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('chrome', {
    storage: {
      sync: { get: async () => ({ hourlyRate: 35, weekendBonus: 10 }) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { id: 'test-extension', onMessage: { addListener: (fn) => { messageListener = fn; } } },
  });
  const storage = {
    token: 'test-token',
    defaultWorkspace: JSON.stringify({ id: 'test-workspace' }),
    user: JSON.stringify({ id: 'test-user', settings: { timeZone: 'Europe/Paris' } }),
  };
  vi.stubGlobal('localStorage', { getItem: (key) => storage[key] ?? null });
  fetchEntries = vi.fn(async (url) => {
    const params = new URL(url).searchParams;
    const start = Date.parse(params.get('start'));
    const end = Date.parse(params.get('end'));
    const entries = ENTRIES.filter(({ timeInterval }) =>
      Date.parse(timeInterval.start) <= end && Date.parse(timeInterval.end) > start);
    return { ok: true, json: async () => entries };
  });
  vi.stubGlobal('fetch', fetchEntries);

  await import('../content/main.js');
  await vi.advanceTimersByTimeAsync(0);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expectParisRange(url) {
  const params = new URL(url).searchParams;
  expect(params.get('start')).toBe('2026-08-31T22:00:00.000Z');
  expect(params.get('end')).toBe('2026-09-30T21:59:59.999Z');
}

describe('dashboard with a Paris Clockify account while travelling', () => {
  it('includes boundary entries and the weekend bonus in the earnings card', () => {
    expect(fetchEntries).toHaveBeenCalledTimes(1);
    expectParisRange(fetchEntries.mock.calls[0][0]);
    expect(card.innerHTML).toContain('2.00 h weekend');
    expect(card.innerHTML).not.toContain('weekend bonus not included');
  });

  it('uses the same range and weekend split for invoice detection', async () => {
    const response = await new Promise((resolve) => {
      expect(messageListener({ type: 'GET_INVOICE_DATA' }, {}, resolve)).toBe(true);
    });
    expectParisRange(fetchEntries.mock.calls.at(-1)[0]);
    expect(response).toMatchObject({
      page: 'dashboard', source: 'api', range: LABEL, weekendHours: 2, dayCount: 3,
    });
  });
});
