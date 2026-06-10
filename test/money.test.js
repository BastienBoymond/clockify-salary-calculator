import { describe, it, expect } from 'vitest';
import { calculate } from '../shared/money.js';

describe('calculate', () => {
  it('applies the waterfall in order: social → prof deduction → income tax', () => {
    // FR micro-BNC-style profile: 100h × 50, 22% social, 34% abattement, 2.2% VL
    const r = calculate(100, { hourlyRate: 50, socialCharges: 22, profExpense: 34, taxRate: 2.2 });
    expect(r.gross).toBe(5000);
    expect(r.socialAmt).toBe(1100);
    expect(r.afterSocial).toBe(3900);
    expect(r.profDeduction).toBeCloseTo(1326);
    expect(r.taxable).toBeCloseTo(2574);
    expect(r.taxAmt).toBeCloseTo(56.628);
    expect(r.net).toBeCloseTo(2517.372);
  });

  it('net equals gross when every deduction is zero', () => {
    const r = calculate(8, { hourlyRate: 80 });
    expect(r.gross).toBe(640);
    expect(r.net).toBe(640);
  });

  it('returns all zeros without a rate', () => {
    const r = calculate(40, {});
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });

  it('tolerates a missing settings object', () => {
    expect(calculate(10).net).toBe(0);
  });
});
