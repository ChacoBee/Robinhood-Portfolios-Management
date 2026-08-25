import { ratio, usd } from '@aurum/domain';
import { describe, expect, it } from 'vitest';
import {
  formatCompactMoney,
  formatDateTime,
  formatMoney,
  formatRatio,
  valueDirection,
} from '../../lib/formatters';

describe('portfolio formatters', () => {
  it('formats money and ratios without mutating their decimal source values', () => {
    expect(formatMoney(usd('128640.25'))).toBe('$128,640.25');
    expect(formatMoney(usd('-42.1'), { sign: true })).toBe('-$42.10');
    expect(formatMoney(usd('42.1'), { sign: true })).toBe('+$42.10');
    expect(formatCompactMoney(usd('128640.25'))).toBe('$128.6K');
    expect(formatRatio(ratio('0.0101'), { sign: true })).toBe('+1.01%');
  });

  it('keeps unavailable financial values explicit', () => {
    expect(formatMoney(null)).toBe('Unavailable');
    expect(formatRatio(null)).toBe('Unavailable');
    expect(valueDirection(null)).toBe('neutral');
  });

  it('formats freshness in the dashboard timezone', () => {
    expect(formatDateTime('2026-08-25T14:14:00.000Z')).toMatch(/Aug 25, 2026.*10:14 AM ET/);
  });
});
