// Earnings settings persisted in chrome.storage.sync.
export const SETTINGS_KEYS = [
  'hourlyRate', 'weekendBonus', 'paidCurrency', 'receiveCurrency', 'socialCharges', 'profExpense', 'taxRate', 'exchangeRate',
  'showDashboard', 'showCalendar', 'showTrackerDay', 'showTrackerWeek',
];

// Raw storage values → usable settings. Numbers default to 0 (exchange rate
// to 1); per-location widget toggles default to on (undefined !== false → true).
export function normalizeSettings(data) {
  return {
    hourlyRate:      data.hourlyRate      || 0,
    weekendBonus:    data.weekendBonus    || 0,
    paidCurrency:    data.paidCurrency    || 'EUR',
    receiveCurrency: data.receiveCurrency || 'EUR',
    socialCharges:   data.socialCharges   || 0,
    profExpense:     data.profExpense     || 0,
    taxRate:         data.taxRate         || 0,
    exchangeRate:    data.exchangeRate    || 1,
    showDashboard:   data.showDashboard   !== false,
    showCalendar:    data.showCalendar    !== false,
    showTrackerDay:  data.showTrackerDay  !== false,
    showTrackerWeek: data.showTrackerWeek !== false,
  };
}

export async function loadSettings() {
  return normalizeSettings(await chrome.storage.sync.get(SETTINGS_KEYS));
}
