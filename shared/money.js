// Single source of truth for the net-pay waterfall:
// gross → social charges → professional-expense deduction → income tax.
//
// `hours` is ALWAYS the total tracked hours. `weekendHours` is the subset of
// those falling on a Saturday or Sunday; they earn `weekendBonus` EXTRA per
// hour on top of `hourlyRate` (additive, not a replacement rate). It is clamped
// to [0, hours] because the two numbers come from independent DOM scrapes — a
// double-counting scraper must not be able to inflate the pay.
export function calculate(
  hours,
  { hourlyRate = 0, weekendBonus = 0, socialCharges = 0, profExpense = 0, taxRate = 0 } = {},
  { weekendHours = 0 } = {},
) {
  const wkHours       = Math.min(Math.max(weekendHours, 0), Math.max(hours, 0));
  const baseGross     = hours * hourlyRate;
  const weekendAmt    = wkHours * weekendBonus;
  const gross         = baseGross + weekendAmt;
  const socialAmt     = gross * (socialCharges / 100);
  const afterSocial   = gross - socialAmt;
  const profDeduction = afterSocial * (profExpense / 100);
  const taxable       = afterSocial - profDeduction;
  const taxAmt        = taxable * (taxRate / 100);
  const net           = taxable - taxAmt;
  return {
    baseGross, weekendHours: wkHours, weekendAmt,
    gross, socialAmt, afterSocial, profDeduction, taxable, taxAmt, net,
  };
}
