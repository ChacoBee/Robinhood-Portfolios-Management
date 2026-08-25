import { describe, expect, it } from 'vitest';
import { reconcileAccount, usd } from '../src/index';

describe('account reconciliation', () => {
  it('blocks headline eligibility for an unexplained residual', () => {
    expect(
      reconcileAccount({
        totalKind: 'provider_portfolio_value',
        providerTotal: usd('100.00'),
        positions: usd('94.00'),
        cash: usd('5.00'),
        accrued: usd('0.00'),
        absoluteTolerance: usd('0.02'),
        residualKind: 'unexplained',
      }),
    ).toMatchObject({
      modeledTotal: usd('99.00'),
      residual: usd('1.00'),
      effectiveTolerance: usd('0.02'),
      state: 'unexplained_residual',
      headlineEligible: false,
      allocationEligible: false,
      returnsEligible: false,
    });
  });

  it('uses the greater of $0.02 and 0.01% of provider value', () => {
    expect(
      reconcileAccount({
        totalKind: 'account_equity',
        providerTotal: usd('100.00'),
        positions: usd('99.98'),
        cash: usd('0'),
        accrued: usd('0'),
        absoluteTolerance: usd('0.02'),
        residualKind: 'unexplained',
      }),
    ).toMatchObject({ state: 'reconciled', effectiveTolerance: usd('0.02') });

    expect(
      reconcileAccount({
        totalKind: 'net_liquidation_value',
        providerTotal: usd('1000000'),
        positions: usd('999901'),
        cash: usd('0'),
        accrued: usd('0'),
        absoluteTolerance: usd('0.02'),
        residualKind: 'unexplained',
      }),
    ).toMatchObject({ state: 'reconciled', effectiveTolerance: usd('100') });
  });

  it('keeps a classified unsupported residual explicit and eligible', () => {
    expect(
      reconcileAccount({
        totalKind: 'provider_portfolio_value',
        providerTotal: usd('100'),
        positions: usd('80'),
        cash: usd('5'),
        accrued: usd('0'),
        absoluteTolerance: usd('0.02'),
        residualKind: 'expected_unsupported',
      }),
    ).toMatchObject({
      state: 'expected_unsupported_residual',
      residual: usd('15'),
      headlineEligible: true,
      allocationEligible: true,
      returnsEligible: true,
    });
  });

  it('does not compute against an unknown semantic total', () => {
    expect(
      reconcileAccount({
        totalKind: 'unknown',
        providerTotal: usd('100'),
        positions: usd('90'),
        cash: usd('10'),
        accrued: usd('0'),
        absoluteTolerance: usd('0.02'),
        residualKind: 'unexplained',
      }),
    ).toEqual({
      state: 'not_computable',
      providerTotal: null,
      modeledTotal: usd('100'),
      residual: null,
      effectiveTolerance: null,
      headlineEligible: false,
      allocationEligible: false,
      returnsEligible: false,
      reason: 'unknown_total_semantics',
    });
  });
});
