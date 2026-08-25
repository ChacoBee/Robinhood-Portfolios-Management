import { describe, expect, it } from 'vitest';
import { addMoney, ratio, subtractMoney, usd } from '../src/index';

describe('canonical money', () => {
  it('adds decimal values without binary floating-point drift', () => {
    expect(addMoney(usd('0.10'), usd('0.20'))).toEqual(usd('0.30'));
  });

  it('normalizes exponent notation and signed zero at the boundary', () => {
    expect(usd('1e-7')).toEqual({ amount: '0.0000001', currency: 'USD' });
    expect(usd('-0')).toEqual({ amount: '0', currency: 'USD' });
    expect(ratio('1.2500')).toEqual({ value: '1.25' });
  });

  it('supports negative results without losing decimal precision', () => {
    expect(subtractMoney(usd('12.005'), usd('12.01'))).toEqual(usd('-0.005'));
  });

  it('rejects non-finite monetary input', () => {
    expect(() => usd('NaN')).toThrow(/finite decimal/i);
    expect(() => usd('Infinity')).toThrow(/finite decimal/i);
  });
});
