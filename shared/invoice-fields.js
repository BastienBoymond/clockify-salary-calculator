// Invoice settings: storage key ↔ input id in the popup's Invoice tab.
// Used by the invoice tab (read/fill) and the PDF importer (auto-fill).
export const INVOICE_FIELD_IDS = {
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

// Everything the invoice feature persists: the fields plus the numbering counter.
export const INVOICE_KEYS = [...Object.keys(INVOICE_FIELD_IDS), 'inv_lastNumber'];
