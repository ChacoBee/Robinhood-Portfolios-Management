import { describe, expect, it } from 'vitest';
import { normalizeCsvTransaction, type CsvSourceRow } from '../../../src/imports';

const sourceFileSha256 = 'a'.repeat(64);

function row(date: string, amount = '10.00'): CsvSourceRow {
  return {
    rowNumber: 2,
    values: {
      date,
      type: 'deposit',
      amount,
      description: 'Synthetic funding',
      transaction_id: 'syn-date-001',
    },
    canonical: `synthetic:${date}`,
  };
}

describe('normalizeCsvTransaction', () => {
  it('rejects ambiguous or timezone-free date formats', () => {
    expect(() =>
      normalizeCsvTransaction(row('08/01/2026'), 'account-synthetic', sourceFileSha256),
    ).toThrow('invalid date');
    expect(() =>
      normalizeCsvTransaction(
        row('2026-08-01T12:00:00'),
        'account-synthetic',
        sourceFileSha256,
      ),
    ).toThrow('invalid date');
  });

  it('rejects impossible ISO calendar dates instead of rolling them forward', () => {
    expect(() =>
      normalizeCsvTransaction(row('2026-02-30'), 'account-synthetic', sourceFileSha256),
    ).toThrow('invalid date');
    expect(() =>
      normalizeCsvTransaction(
        row('2026-02-30T12:00:00Z'),
        'account-synthetic',
        sourceFileSha256,
      ),
    ).toThrow('invalid date');
  });

  it('normalizes date-only and explicitly zoned ISO timestamps deterministically', () => {
    expect(
      normalizeCsvTransaction(row('2026-08-01'), 'account-synthetic', sourceFileSha256)
        .effectiveAt,
    ).toBe('2026-08-01T12:00:00.000Z');
    expect(
      normalizeCsvTransaction(
        row('2026-08-01T08:00:00-04:00'),
        'account-synthetic',
        sourceFileSha256,
      ).effectiveAt,
    ).toBe('2026-08-01T12:00:00.000Z');
  });

  it('rejects malformed thousands separators instead of changing the value', () => {
    expect(() =>
      normalizeCsvTransaction(row('2026-08-01', '1,,2'), 'account-synthetic', sourceFileSha256),
    ).toThrow('invalid money');
    expect(() =>
      normalizeCsvTransaction(row('2026-08-01', '12,34'), 'account-synthetic', sourceFileSha256),
    ).toThrow('invalid money');
    expect(
      normalizeCsvTransaction(row('2026-08-01', '$1,234.50'), 'account-synthetic', sourceFileSha256)
        .amount.amount,
    ).toBe('1234.5');
  });
});
