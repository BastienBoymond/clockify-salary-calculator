# Clockify Salary Calculator

A Chrome extension that displays your real net take-home earnings directly on the Clockify dashboard, based on your hourly rate, taxes, and deductions.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/oocmjejoijcaddcfgommkhfpbbhbhabo?logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store)][store]
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/oocmjejoijcaddcfgommkhfpbbhbhabo?label=users)][store]
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/oocmjejoijcaddcfgommkhfpbbhbhabo?label=rating)][store]

[store]: https://chromewebstore.google.com/detail/oocmjejoijcaddcfgommkhfpbbhbhabo

## Features

- **Live earnings card** injected into your Clockify dashboard, updating as you track time
- **Weekly recap widget** on the calendar page — total hours plus net/gross earnings for the displayed week, next to the Week/Day buttons
- **Time tracker earnings** — a per-day net/gross badge next to each day group's total, plus a recap pill next to the "Week total" for the whole visible range
- **Per-location widget toggles** in the Settings tab — independently switch each widget (dashboard card, calendar recap, tracker daily, tracker weekly) on or off; changes apply live
- **Weekend bonus** — an extra hourly amount for Saturdays and Sundays, reflected in the tracker and calendar widgets and billed as its own "Weekend surcharge" line on the generated invoice
- **Net salary calculation** with configurable social charges, professional expense deductions, and income tax
- **Multi-currency support** with live exchange rates (via [open.er-api.com](https://open.er-api.com))
- **Earnings simulator** in the popup with presets (1h, 1d, 1w, 1m)
- **Settings sync** across devices via Chrome sync storage

## How It Works

The extension reads your total tracked hours from the Clockify dashboard and applies your configured settings to compute net income using this formula:

```
Gross        = hours × hourly rate + weekend hours × weekend bonus
After social = Gross − (Gross × social charges %)
Taxable      = After social − (After social × professional expense %)
Net          = Taxable − (Taxable × income tax rate %)
```

The weekend bonus is an **extra** amount per hour on top of the base rate, applied to hours
tracked on a Saturday or Sunday. Splitting weekday from weekend hours needs a day-by-day
breakdown, which comes from two places depending on the page:

- **Calendar and Time Tracker** read it straight from the DOM, which already groups by day. The
  tracker scrape proves its own completeness by comparing the sum of the visible day groups
  against the range totals Clockify prints; if they disagree (entries still lazy-loading) it
  reports "unknown" rather than a number that would under-bill.
- **Dashboard and invoice** use the Clockify API. The dashboard's daily activity chart is a
  `<canvas>`, so nothing is readable from the page there. The extension reuses the session the
  web app already holds in its own `localStorage` — no API key to paste — and cross-checks the
  total it computes against the one the page displays before showing anything.

Entries are bucketed into days using the **user's timezone**, not UTC: an entry starting
`2026-07-31T22:00:00Z` is Saturday 1 August in Europe/Paris, and reading it as UTC would
silently drop the bonus.

## Installation

### From the Chrome Web Store (recommended)

[**Install Clockify Salary Calculator →**][store]

### From source (development)

No build step or dependencies required — pure vanilla JavaScript.

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon appears in your toolbar

## Configuration

1. Click the extension icon to open the settings popup
2. Set your **hourly rate** and the currency you are paid in, plus an optional **weekend bonus** (extra per hour on Saturdays and Sundays)
3. Configure your deductions:
   - **Social charges** (e.g. cotisations sociales)
   - **Professional expense deduction** (e.g. 34% micro-BNC abattement)
   - **Income tax rate** (e.g. 2.2% versement libératoire, or your TMI bracket)
4. Choose the **currency you receive** — set the exchange rate manually or click **Live rate** to fetch it automatically
5. Click **Save settings**
6. Navigate to your Clockify dashboard — the earnings card will appear automatically

## Project Structure

```
clockify-salary-calculator/
├── manifest.json          # Chrome extension manifest (V3)
├── shared/                # Modules used by every surface
│   ├── money.js           # The net-pay calculation (single source of truth)
│   ├── format.js          # Time, currency, French-number & date formatting
│   ├── currencies.js      # Currency lists, symbols, invoice labels
│   ├── settings.js        # Settings keys, defaults, load helper
│   └── invoice-fields.js  # Invoice storage-key ↔ form-field map
├── content/               # Injected into app.clockify.me
│   ├── loader.js          # Classic stub that imports the ES-module entry
│   ├── main.js            # Orchestration: observer, SPA navigation, injection
│   ├── selectors.js       # Every Clockify selector & scraper (one-file fix on UI changes)
│   ├── widgets.js         # Earnings card / week pill / day badge builders
│   └── content.css        # Styling for the injected widgets
├── popup/
│   ├── popup.html         # Settings & invoice UI
│   ├── popup.css          # Popup styling (incl. dark theme variables)
│   ├── popup.js           # Settings tab: load/save, currencies, live FX rate
│   ├── simulator.js       # Earnings simulator
│   ├── invoice-tab.js     # Invoice fields & generation
│   ├── pdf-import.js      # Auto-fill invoice settings from a PDF
│   └── theme.js           # Dark/light/system theme switching
├── invoice/               # Printable invoice page (invoice.html/.css/.js)
├── test/                  # Unit tests for the money & formatting modules
└── icons/                 # Extension icons (16, 32, 48, 128px)
```

The content script reacts to `chrome.storage.onChanged`, so settings saved in the popup (or synced from another device) re-render the widgets live — no messaging needed.

## Development

The extension itself has no build step — load the folder as-is. Dev dependencies are only used for tests:

```
npm install
npm test
```

## License

MIT
