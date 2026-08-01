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

describe('calculate — weekend bonus', () => {
  it('adds the bonus on top of the base rate, for the weekend hours only', () => {
    const r = calculate(100, { hourlyRate: 50, weekendBonus: 10 }, { weekendHours: 16 });
    expect(r.baseGross).toBe(5000);
    expect(r.weekendAmt).toBe(160);
    expect(r.gross).toBe(5160);
    expect(r.net).toBe(5160);
  });

  it('applies every deduction to the combined gross', () => {
    const r = calculate(100, { hourlyRate: 50, weekendBonus: 10, socialCharges: 22 }, { weekendHours: 16 });
    expect(r.gross).toBe(5160);
    expect(r.socialAmt).toBeCloseTo(1135.2);
    expect(r.net).toBeCloseTo(4024.8);
  });

  it('matches the legacy result when the third argument is omitted', () => {
    const s = { hourlyRate: 50, weekendBonus: 10, socialCharges: 22 };
    expect(calculate(100, s)).toEqual(calculate(100, s, { weekendHours: 0 }));
    expect(calculate(100, s).gross).toBe(5000);
  });

  it('ignores a bonus when no weekend hours were tracked', () => {
    expect(calculate(10, { hourlyRate: 50, weekendBonus: 999 }).gross).toBe(500);
  });

  it('clamps weekend hours to the total — a double-counting scraper cannot inflate pay', () => {
    expect(calculate(10, { hourlyRate: 50, weekendBonus: 10 }, { weekendHours: 999 }).weekendAmt).toBe(100);
    expect(calculate(10, { hourlyRate: 50, weekendBonus: 10 }, { weekendHours: -5 }).weekendAmt).toBe(0);
  });
});
