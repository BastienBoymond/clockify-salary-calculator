# Clockify Salary Calculator

A Chrome extension that displays your real net take-home earnings directly on the Clockify dashboard, based on your hourly rate, taxes, and deductions.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

## Features

- **Live earnings card** injected into your Clockify dashboard, updating as you track time
- **Net salary calculation** with configurable social charges, professional expense deductions, and income tax
- **Multi-currency support** with live exchange rates (via [open.er-api.com](https://open.er-api.com))
- **Earnings simulator** in the popup with presets (1h, 1d, 1w, 1m)
- **Settings sync** across devices via Chrome sync storage

## How It Works

The extension reads your total tracked hours from the Clockify dashboard and applies your configured settings to compute net income using this formula:

```
Gross       = hours × hourly rate
After social = Gross − (Gross × social charges %)
Taxable     = After social − (After social × professional expense %)
Net         = Taxable − (Taxable × income tax rate %)
```

## Installation

No build step or dependencies required — pure vanilla JavaScript.

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon appears in your toolbar

## Configuration

1. Click the extension icon to open the settings popup
2. Set your **hourly rate** and the currency you are paid in
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
├── manifest.json      # Chrome extension manifest (V3)
├── content.js         # Injects and updates the earnings card on the dashboard
├── content.css        # Styling for the injected card
├── popup/
│   ├── popup.html     # Settings & simulator UI
│   └── popup.js       # Settings logic, simulation, live rate fetch
└── icons/             # Extension icons (16, 32, 48, 128px)
```

## License

MIT
