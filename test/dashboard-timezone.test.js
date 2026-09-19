import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fmt } from '../shared/format.js';

const LABEL = 'Sep 1, 2026 - Sep 30, 2026';
const entry = (start, end, duration) => ({ timeInterval: { start, end, duration } });
const hourEntry = (start, hours) => entry(
  start, new Date(Date.parse(start) + hours * 3_600_000).toISOString(), `PT${hours * 3600}S`,
);
const ENTRIES = [
  hourEntry('2026-08-31T21:00:00Z', 0.5), // August in Paris
  hourEntry('2026-08-31T22:00:00Z', 1),   // September in Paris, August in LA
  hourEntry('2026-09-04T22:00:00Z', 2),   // Saturday in Paris, Friday in LA
  hourEntry('2026-09-30T21:30:00Z', 0.5), // Last half-hour of September in Paris
  hourEntry('2026-09-30T22:00:00Z', 1.5), // October in Paris
];

// Sanitized daily totals from the reported month. The two September 1 entries
// are the real boundary times: shifting midnight to 07:00 excludes both in LA.
const REPORTED_MONTH = [
  hourEntry('2026-09-01T07:45:00Z', 1),
  hourEntry('2026-09-01T11:45:00Z', 4.75),
  ...[
    ['02', 9.25], ['03', 4], ['04', 4.5], ['05', 4.25], ['06', 2],
    ['07', 8], ['08', 10.25], ['09', 8.25], ['10', 7.75], ['11', 6.25],
    ['12', 1], ['14', 7.25], ['15', 9], ['16', 4.75], ['17', 13],
    ['18', 13.25], ['19', 2.5],
  ].map(([day, hours]) => hourEntry(`2026-09-${day}T15:00:00Z`, hours)),
];

let card;
let fetchEntries;
let messageListener;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  card = null;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function showDashboard({
  timeZone = 'Europe/Paris', label = LABEL, entries = ENTRIES, total = '3:30:00',
} = {}) {
  const totalEl = {
    textContent: total,
    closest: () => ({ insertAdjacentElement: (_position, element) => { card = element; } }),
  };
  vi.stubGlobal('document', {
    body: {},
    querySelector: (selector) => selector === '[data-cy="total-time"]' ? totalEl : null,
    querySelectorAll: (selector) => selector === 'datepicker-range .cl-d-print-block'
      ? [{ textContent: label }] : [],
    getElementById: () => card,
    createElement: () => ({ remove: () => { card = null; } }),
    addEventListener: vi.fn(),
  });
  vi.stubGlobal('location', { pathname: '/dashboard' });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('chrome', {
    storage: {
      sync: { get: async () => ({ hourlyRate: 35, weekendBonus: 10, paidCurrency: 'USD' }) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { id: 'test-extension', onMessage: { addListener: (fn) => { messageListener = fn; } } },
  });
  const storage = {
    token: 'test-token',
    defaultWorkspace: JSON.stringify({ id: 'test-workspace' }),
    user: JSON.stringify({ id: 'test-user', settings: { timeZone } }),
  };
  vi.stubGlobal('localStorage', { getItem: (key) => storage[key] ?? null });

  // Clockify treats the request's Z-suffixed filters as account-local wall
  // times, while response timestamps are true UTC. Comparing raw UTC instants
  // here used to hide the production bug. Do not use the range helper to mock
  // the server: its wire format is precisely what this integration must test.
  const localClock = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3, hourCycle: 'h23',
  });
  fetchEntries = vi.fn(async (url) => {
    const params = new URL(url).searchParams;
    const start = params.get('start');
    const end = params.get('end');
    const matching = entries.filter(({ timeInterval }) => {
      const p = Object.fromEntries(localClock.formatToParts(new Date(timeInterval.start))
        .map(({ type, value }) => [type, value]));
      const localStart = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}Z`;
      return localStart >= start && localStart <= end;
    });
    return { ok: true, json: async () => matching };
  });
  vi.stubGlobal('fetch', fetchEntries);

  await import('../content/main.js');
  await vi.advanceTimersByTimeAsync(0);
}

function invoiceData() {
  return new Promise((resolve) => {
    expect(messageListener({ type: 'GET_INVOICE_DATA' }, {}, resolve)).toBe(true);
  });
}

function expectRange(url, firstDay = '2026-09-01', lastDay = '2026-09-30') {
  const params = new URL(url).searchParams;
  expect(params.get('start')).toBe(`${firstDay}T00:00:00.000Z`);
  expect(params.get('end')).toBe(`${lastDay}T23:59:59.999Z`);
}

describe('dashboard and invoice account-local date filters', () => {
  it('includes the first and last local entries for a Paris account', async () => {
    await showDashboard();
    expect(fetchEntries).toHaveBeenCalledTimes(1);
    expectRange(fetchEntries.mock.calls[0][0]);
    expect(card.innerHTML).toContain('2.00 h weekend');
    expect(card.innerHTML).toContain(`of ${fmt(142.5, 'USD')} gross`);
    expect(card.innerHTML).not.toContain('weekend bonus not included');

    expect(await invoiceData()).toMatchObject({
      page: 'dashboard', source: 'api', range: LABEL, weekendHours: 2, dayCount: 3,
    });
    expect(fetchEntries.mock.calls[1][0]).toBe(fetchEntries.mock.calls[0][0]);
  });

  it('restores the reported 121 hours and 9.75 weekend hours after moving to LA', async () => {
    await showDashboard({ timeZone: 'America/Los_Angeles', entries: REPORTED_MONTH, total: '121:00:00' });
    expect(fetchEntries).toHaveBeenCalledTimes(1);
    expectRange(fetchEntries.mock.calls[0][0]);
    expect(card.innerHTML).toContain('121.00 h');
    expect(card.innerHTML).toContain('9.75 h weekend');
    expect(card.innerHTML).toContain(`of ${fmt(4332.5, 'USD')} gross`);
    expect(card.innerHTML).not.toContain('weekend bonus not included');

    expect(await invoiceData()).toMatchObject({
      page: 'dashboard', source: 'api', range: LABEL, weekendHours: 9.75, dayCount: 18,
    });
    expect(fetchEntries.mock.calls[1][0]).toBe(fetchEntries.mock.calls[0][0]);
  });

  it('includes LA month boundaries without pulling in adjacent local dates', async () => {
    await showDashboard({
      timeZone: 'America/Los_Angeles', total: '2:00:00',
      label: 'Aug 1, 2026 - Aug 31, 2026',
      entries: [
        hourEntry('2026-08-01T06:00:00Z', 1), // July 31 in LA
        hourEntry('2026-08-01T07:00:00Z', 1), // Saturday, first local hour
        hourEntry('2026-09-01T06:00:00Z', 1), // Monday, last local hour
        hourEntry('2026-09-01T07:00:00Z', 1), // September 1 in LA
      ],
    });
    expectRange(fetchEntries.mock.calls[0][0], '2026-08-01', '2026-08-31');
    expect(card.innerHTML).toContain('1.00 h weekend');
    expect(card.innerHTML).not.toContain('weekend bonus not included');
    expect(await invoiceData()).toMatchObject({ weekendHours: 1, dayCount: 2 });
  });

  it.each([
    ['Europe/Paris', '2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T21:00:00Z'],
    ['Europe/Paris', '2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T22:00:00Z'],
    ['America/Los_Angeles', '2026-03-08', '2026-03-08T08:00:00Z', '2026-03-09T06:00:00Z'],
    ['America/Los_Angeles', '2026-11-01', '2026-11-01T07:00:00Z', '2026-11-02T07:00:00Z'],
  ])('includes both ends of the DST Sunday in %s on %s', async (timeZone, day, firstHour, lastHour) => {
    await showDashboard({
      timeZone, label: `${day} - ${day}`, total: '2:00:00',
      entries: [
        hourEntry(new Date(Date.parse(firstHour) - 3_600_000).toISOString(), 1),
        hourEntry(firstHour, 1), hourEntry(lastHour, 1),
        hourEntry(new Date(Date.parse(lastHour) + 3_600_000).toISOString(), 1),
      ],
    });
    expectRange(fetchEntries.mock.calls[0][0], day, day);
    expect(card.innerHTML).toContain('2.00 h weekend');
    expect(card.innerHTML).not.toContain('weekend bonus not included');
    expect(await invoiceData()).toMatchObject({ weekendHours: 2, dayCount: 1 });
  });

  it('still withholds an unverified bonus when the page and API totals disagree', async () => {
    await showDashboard({ total: '9:00:00' });
    expect(card.innerHTML).toContain('weekend bonus not included');
    expect(card.innerHTML).toContain('Weekend hours could not be verified for this period.');
    expect(await invoiceData()).toMatchObject({ weekendHours: null });
  });
});
