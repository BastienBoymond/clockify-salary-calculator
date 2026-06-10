// Single source of truth for the net-pay waterfall:
// gross → social charges → professional-expense deduction → income tax.
export function calculate(hours, { hourlyRate = 0, socialCharges = 0, profExpense = 0, taxRate = 0 } = {}) {
  const gross         = hours * hourlyRate;
  const socialAmt     = gross * (socialCharges / 100);
  const afterSocial   = gross - socialAmt;
  const profDeduction = afterSocial * (profExpense / 100);
  const taxable       = afterSocial - profDeduction;
  const taxAmt        = taxable * (taxRate / 100);
  const net           = taxable - taxAmt;
  return { gross, socialAmt, afterSocial, profDeduction, taxable, taxAmt, net };
}
