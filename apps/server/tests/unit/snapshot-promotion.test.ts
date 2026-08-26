import { describe, expect, it } from 'vitest';
import { usd } from '@aurum/domain';
import {
  buildSnapshotPromotion,
  SnapshotPromotionError,
  type AccountRefreshBundle,
} from '../../src/sync/snapshot-promotion';

const observedAt = '2026-08-25T14:00:00.000Z';

function bundle(input: { total: string; knownUnsupported: string | null }): AccountRefreshBundle {
  return {
    account: {
      providerRef: 'sealed-account' as never,
      stableKey: 'account-1' as never,
      maskedAccountNumber: null,
      displayName: 'Taxable',
      status: 'active',
      totalKind: 'provider_portfolio_value',
      sourceAsOf: observedAt,
    },
    portfolio: {
      providerRef: 'sealed-account' as never,
      stableKey: 'account-1' as never,
      total: { state: 'available', value: usd(input.total) },
      cash: { state: 'available', value: usd('5') },
      buyingPower: { state: 'available', value: usd('5') },
      accrued: { state: 'available', value: usd('0') },
      knownUnsupportedAggregate: input.knownUnsupported === null
        ? { state: 'unavailable', reason: 'known_unsupported_aggregate_missing' }
        : { state: 'available', value: usd(input.knownUnsupported) },
      currency: 'USD',
      sourceAsOf: observedAt,
    } as unknown as AccountRefreshBundle['portfolio'],
    equityPositions: [],
    optionPositions: [],
    quotes: [],
  };
}

function promote(input: { total: string; knownUnsupported: string | null }) {
  return buildSnapshotPromotion({
    syncRunId: 'sync-1',
    bundles: [bundle(input)],
    receivedAt: observedAt,
  });
}

describe('snapshot promotion known unsupported aggregate', () => {
  it('reconciles without adding an informational deposit to the accrued component', () => {
    expect(promote({ total: '25', knownUnsupported: '20' })).toMatchObject({
      coverage: 'partial_known_unsupported',
      reconciliationStatus: 'reconciled',
      accounts: [{ accrued: '0', knownUnsupportedAggregate: '20', unsupportedDetailValue: '20', modeledTotal: '25' }],
      payload: { unsupportedDetailValue: '20' },
    });
  });

  it('rejects a residual beyond detailed values and the known unsupported aggregate', () => {
    expect(() => promote({ total: '26', knownUnsupported: '20' })).toThrow(
      new SnapshotPromotionError('account_reconciliation_ineligible'),
    );
  });

  it('fails closed when a required aggregate component is unavailable', () => {
    expect(() => promote({ total: '25', knownUnsupported: null })).toThrow(
      new SnapshotPromotionError('account_reconciliation_ineligible'),
    );
  });
});
