import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import {
  compareMoney,
  reconcileAccount,
  sumMoney,
  usd,
  type Money,
} from '@aurum/domain';
import type {
  AccountObservation,
  AccountValueObservation,
  EquityPositionObservation,
  EquityQuoteObservation,
  OptionPositionObservation,
} from '../robinhood/mapper';
import type { StableAccountKey } from '../robinhood/vault';
import {
  evaluateSourceFreshness,
  type ValuationSessionPhase,
} from './freshness-policy';

export interface AccountRefreshBundle {
  account: AccountObservation;
  portfolio: AccountValueObservation;
  equityPositions: readonly EquityPositionObservation[];
  optionPositions: readonly OptionPositionObservation[];
  quotes: readonly EquityQuoteObservation[];
}

export interface SnapshotPromotionInput {
  syncRunId: string;
  bundles: readonly AccountRefreshBundle[];
  receivedAt: string;
  phase?: ValuationSessionPhase;
  lastRegularCloseAt?: string | null;
  maxSourceSkewSeconds?: number;
}

export interface PersistableEquityPosition {
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  quantity: string;
  marketValue: string;
  costBasis: string | null;
  costBasisSource: EquityPositionObservation['costBasisSource'];
  currency: string;
  sourceAsOf: string;
  detailSupport: 'supported' | 'known_unsupported';
}

export interface PersistableOptionPosition {
  optionId: string;
  symbol: string;
  quantity: string;
  marketValue: string;
  currency: string;
  sourceAsOf: string;
  detailSupport: 'known_unsupported';
}

export interface PersistableQuote {
  instrumentId: string;
  symbol: string;
  price: string | null;
  currency: string;
  marketState: EquityQuoteObservation['marketState'];
  sourceAsOf: string;
  quality: EquityQuoteObservation['quality'];
}

export interface AccountPromotionDetail {
  stableKey: StableAccountKey;
  maskedAccountNumber: string | null;
  displayName: string;
  status: AccountObservation['status'];
  totalKind: AccountObservation['totalKind'];
  included: boolean;
  inclusionReason: 'active' | 'closed_nonzero' | 'closed_zero';
  providerTotal: string;
  cash: string;
  accrued: string;
  supportedPositionValue: string;
  unsupportedDetailValue: string;
  modeledTotal: string;
  residual: string;
  tolerance: string;
  reconciliationState: 'reconciled';
  coverage: 'complete' | 'partial_known_unsupported';
  accountSourceAsOf: string;
  portfolioSourceAsOf: string;
  sourceWindowStart: string;
  sourceWindowEnd: string;
  accountChecksum: string;
  portfolioChecksum: string;
  equityPositionsChecksum: string;
  optionPositionsChecksum: string;
  quotesChecksum: string;
  equityPositions: readonly PersistableEquityPosition[];
  optionPositions: readonly PersistableOptionPosition[];
  quotes: readonly PersistableQuote[];
}

export interface SnapshotPromotionCandidate {
  syncRunId: string;
  totalValue: Money;
  asOf: string;
  sourceWindowStart: string;
  sourceWindowEnd: string;
  sourceFingerprint: string;
  syncCompleteness: 'complete';
  coverage: 'complete' | 'partial_known_unsupported';
  quoteFreshness: 'fresh' | 'stale' | 'unavailable';
  freshness: 'fresh';
  reconciliationStatus: 'reconciled';
  calculationVersion: 'portfolio-v1';
  mappingVersion: 'robinhood-read-v1';
  accountCount: number;
  accounts: readonly AccountPromotionDetail[];
  payload: Record<string, unknown>;
}

export type SnapshotPromotionFailureCode =
  | 'no_accounts_available'
  | 'no_included_accounts'
  | 'provider_total_unavailable'
  | 'cash_unavailable'
  | 'accrued_unavailable'
  | 'position_value_unavailable'
  | 'option_value_unavailable'
  | 'unknown_total_semantics'
  | 'account_identity_mismatch'
  | 'expected_account_missing'
  | 'account_reconciliation_ineligible'
  | 'invalid_source_timestamp'
  | 'source_timestamp_in_future'
  | 'source_skew_exceeded'
  | 'source_stale';

export class SnapshotPromotionError extends Error {
  constructor(readonly reason: SnapshotPromotionFailureCode) {
    super(reason);
    this.name = 'SnapshotPromotionError';
  }
}

function availableValue(
  value: AccountValueObservation['total'],
  reason: SnapshotPromotionFailureCode,
): Money {
  if (value.state !== 'available') throw new SnapshotPromotionError(reason);
  return value.value;
}

function assertBundleIdentity(bundle: AccountRefreshBundle): void {
  if (
    bundle.portfolio.stableKey !== bundle.account.stableKey ||
    bundle.equityPositions.some(
      (position) => position.stableAccountKey !== bundle.account.stableKey,
    ) ||
    bundle.optionPositions.some(
      (position) => position.stableAccountKey !== bundle.account.stableKey,
    )
  ) {
    throw new SnapshotPromotionError('account_identity_mismatch');
  }
}

const supportedEquityClasses = new Set(['equity', 'stock', 'etf']);

function canonicalChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalFingerprint(accounts: readonly AccountPromotionDetail[]): string {
  const canonical = accounts
    .map((account) => ({
      account: account.stableKey,
      status: account.status,
      totalKind: account.totalKind,
      included: account.included,
      inclusionReason: account.inclusionReason,
      displayName: account.displayName,
      maskedAccountNumber: account.maskedAccountNumber,
      providerTotal: account.providerTotal,
      cash: account.cash,
      accrued: account.accrued,
      accountSourceAsOf: account.accountSourceAsOf,
      portfolioSourceAsOf: account.portfolioSourceAsOf,
      sourceWindowStart: account.sourceWindowStart,
      sourceWindowEnd: account.sourceWindowEnd,
      equities: [...account.equityPositions]
        .sort((left, right) => left.instrumentId.localeCompare(right.instrumentId))
        .map((position) => ({
          instrumentId: position.instrumentId,
          quantity: position.quantity,
          marketValue: position.marketValue,
          symbol: position.symbol,
          name: position.name,
          assetClass: position.assetClass,
          currency: position.currency,
          costBasis: position.costBasis,
          costBasisSource: position.costBasisSource,
          detailSupport: position.detailSupport,
          sourceAsOf: position.sourceAsOf,
        })),
      options: [...account.optionPositions]
        .sort((left, right) => left.optionId.localeCompare(right.optionId))
        .map((position) => ({
          optionId: position.optionId,
          quantity: position.quantity,
          marketValue: position.marketValue,
          symbol: position.symbol,
          currency: position.currency,
          detailSupport: position.detailSupport,
          sourceAsOf: position.sourceAsOf,
        })),
      quotes: [...account.quotes]
        .sort((left, right) => left.instrumentId.localeCompare(right.instrumentId))
        .map((quote) => ({
          instrumentId: quote.instrumentId,
          symbol: quote.symbol,
          price: quote.price,
          currency: quote.currency,
          marketState: quote.marketState,
          sourceAsOf: quote.sourceAsOf,
          quality: quote.quality,
        })),
    }))
    .sort((left, right) => left.account.localeCompare(right.account));
  return canonicalChecksum(canonical);
}

export function buildSnapshotPromotion(
  input: SnapshotPromotionInput,
): SnapshotPromotionCandidate {
  if (input.bundles.length === 0) {
    throw new SnapshotPromotionError('no_accounts_available');
  }

  const stableKeys = input.bundles.map((bundle) => bundle.account.stableKey);
  if (new Set(stableKeys).size !== stableKeys.length) {
    throw new SnapshotPromotionError('account_identity_mismatch');
  }
  input.bundles.forEach(assertBundleIdentity);

  const requiredSourceTimes = input.bundles.flatMap((bundle) => [
    bundle.account.sourceAsOf,
    bundle.portfolio.sourceAsOf,
    ...bundle.equityPositions.map((position) => position.sourceAsOf),
    ...bundle.optionPositions.map((position) => position.sourceAsOf),
  ]);
  const quoteSourceTimes = input.bundles.flatMap((bundle) =>
    bundle.quotes.map((quote) => quote.sourceAsOf),
  );
  const valuationSourceTimes = input.bundles.flatMap((bundle) => [
    bundle.portfolio.sourceAsOf,
    ...bundle.equityPositions.map((position) => position.sourceAsOf),
    ...bundle.optionPositions.map((position) => position.sourceAsOf),
  ]);
  const freshness = evaluateSourceFreshness({
    receivedAt: input.receivedAt,
    phase: input.phase ?? 'regular',
    requiredSourceTimes,
    valuationSourceTimes,
    quoteSourceTimes,
    ...(input.lastRegularCloseAt !== undefined
      ? { lastRegularCloseAt: input.lastRegularCloseAt }
      : {}),
    ...(input.maxSourceSkewSeconds !== undefined
      ? { maxSourceSkewSeconds: input.maxSourceSkewSeconds }
      : {}),
  });
  if (!freshness.eligible) {
    throw new SnapshotPromotionError(freshness.reason);
  }

  const details: AccountPromotionDetail[] = [];
  for (const bundle of input.bundles) {
    const providerTotal = availableValue(
      bundle.portfolio.total,
      'provider_total_unavailable',
    );
    const cash = availableValue(bundle.portfolio.cash, 'cash_unavailable');
    const accrued = availableValue(bundle.portfolio.accrued, 'accrued_unavailable');
    const included =
      bundle.account.status === 'active' || compareMoney(providerTotal, usd(0)) !== 0;
    const inclusionReason =
      bundle.account.status === 'active'
        ? 'active'
        : included
          ? 'closed_nonzero'
          : 'closed_zero';

    if (included && bundle.account.totalKind === 'unknown') {
      throw new SnapshotPromotionError('unknown_total_semantics');
    }

    const equityPositions = bundle.equityPositions.map((position) => {
      const marketValue = availableValue(
        position.marketValue,
        'position_value_unavailable',
      );
      return {
        instrumentId: position.instrumentId,
        symbol: position.symbol,
        name: position.name,
        assetClass: position.assetClass,
        quantity: position.quantity,
        marketValue: marketValue.amount,
        costBasis:
          position.costBasis.state === 'available'
            ? position.costBasis.value.amount
            : null,
        costBasisSource: position.costBasisSource,
        currency: position.currency,
        sourceAsOf: position.sourceAsOf,
        detailSupport: supportedEquityClasses.has(position.assetClass.toLowerCase())
          ? ('supported' as const)
          : ('known_unsupported' as const),
      };
    });
    const optionPositions = bundle.optionPositions.map((position) => ({
      optionId: position.optionId,
      symbol: position.symbol,
      quantity: position.quantity,
      marketValue: availableValue(
        position.marketValue,
        'option_value_unavailable',
      ).amount,
      currency: position.currency,
      sourceAsOf: position.sourceAsOf,
      detailSupport: 'known_unsupported' as const,
    }));

    const supportedValues = equityPositions
      .filter((position) => position.detailSupport === 'supported')
      .map((position) => usd(position.marketValue));
    const unsupportedValues = [
      ...equityPositions
        .filter((position) => position.detailSupport === 'known_unsupported')
        .map((position) => usd(position.marketValue)),
      ...optionPositions.map((position) => usd(position.marketValue)),
    ];
    const supportedPositionValue = sumMoney(supportedValues);
    const unsupportedDetailValue = sumMoney(unsupportedValues);
    const reconciliation = reconcileAccount({
      totalKind: bundle.account.totalKind,
      providerTotal,
      positions: sumMoney([...supportedValues, ...unsupportedValues]),
      cash,
      accrued,
      absoluteTolerance: usd('0.02'),
      residualKind: 'unexplained',
    });
    if (!reconciliation.headlineEligible || reconciliation.state !== 'reconciled') {
      throw new SnapshotPromotionError('account_reconciliation_ineligible');
    }
    const hasUnsupportedDetail = unsupportedValues.length > 0;
    const accountTimes = [
      bundle.account.sourceAsOf,
      bundle.portfolio.sourceAsOf,
      ...bundle.equityPositions.map((position) => position.sourceAsOf),
      ...bundle.optionPositions.map((position) => position.sourceAsOf),
    ].map((value) => Date.parse(value));

    details.push({
      stableKey: bundle.account.stableKey,
      maskedAccountNumber: bundle.account.maskedAccountNumber,
      displayName: bundle.account.displayName,
      status: bundle.account.status,
      totalKind: bundle.account.totalKind,
      included,
      inclusionReason,
      providerTotal: providerTotal.amount,
      cash: cash.amount,
      accrued: accrued.amount,
      supportedPositionValue: supportedPositionValue.amount,
      unsupportedDetailValue: unsupportedDetailValue.amount,
      modeledTotal: reconciliation.modeledTotal?.amount ?? '0',
      residual: reconciliation.residual?.amount ?? '0',
      tolerance: reconciliation.effectiveTolerance?.amount ?? '0',
      reconciliationState: 'reconciled',
      coverage: hasUnsupportedDetail
        ? 'partial_known_unsupported'
        : 'complete',
      accountSourceAsOf: bundle.account.sourceAsOf,
      portfolioSourceAsOf: bundle.portfolio.sourceAsOf,
      sourceWindowStart: new Date(Math.min(...accountTimes)).toISOString(),
      sourceWindowEnd: new Date(Math.max(...accountTimes)).toISOString(),
      accountChecksum: canonicalChecksum({
        stableKey: bundle.account.stableKey,
        displayName: bundle.account.displayName,
        maskedAccountNumber: bundle.account.maskedAccountNumber,
        status: bundle.account.status,
        totalKind: bundle.account.totalKind,
        sourceAsOf: bundle.account.sourceAsOf,
      }),
      portfolioChecksum: canonicalChecksum({
        stableKey: bundle.portfolio.stableKey,
        total: providerTotal.amount,
        cash: cash.amount,
        accrued: accrued.amount,
        currency: bundle.portfolio.currency,
        sourceAsOf: bundle.portfolio.sourceAsOf,
      }),
      equityPositionsChecksum: canonicalChecksum(equityPositions),
      optionPositionsChecksum: canonicalChecksum(optionPositions),
      quotesChecksum: canonicalChecksum(
        bundle.quotes.map((quote) => ({
          instrumentId: quote.instrumentId,
          symbol: quote.symbol,
          price: quote.price?.amount ?? null,
          currency: quote.currency,
          marketState: quote.marketState,
          sourceAsOf: quote.sourceAsOf,
          quality: quote.quality,
        })),
      ),
      equityPositions,
      optionPositions,
      quotes: bundle.quotes.map((quote) => ({
        instrumentId: quote.instrumentId,
        symbol: quote.symbol,
        price: quote.price?.amount ?? null,
        currency: quote.currency,
        marketState: quote.marketState,
        sourceAsOf: quote.sourceAsOf,
        quality: quote.quality,
      })),
    });
  }

  const included = details.filter((account) => account.included);
  if (included.length === 0) {
    throw new SnapshotPromotionError('no_included_accounts');
  }
  const coverage = included.some(
    (account) => account.coverage === 'partial_known_unsupported',
  )
    ? 'partial_known_unsupported'
    : 'complete';
  const totalValue = sumMoney(included.map((account) => usd(account.providerTotal)));
  const unsupportedDetailValue = sumMoney(included.map((account) => usd(account.unsupportedDetailValue)));
  const marketStates = new Set(details.flatMap((account) => account.quotes.map((quote) => quote.marketState)));
  const sourceFingerprint = canonicalFingerprint(details);

  return {
    syncRunId: input.syncRunId,
    totalValue,
    asOf: freshness.asOf,
    sourceWindowStart: freshness.sourceWindowStart,
    sourceWindowEnd: freshness.sourceWindowEnd,
    sourceFingerprint,
    syncCompleteness: 'complete',
    coverage,
    quoteFreshness: freshness.quoteFreshness,
    freshness: 'fresh',
    reconciliationStatus: 'reconciled',
    calculationVersion: 'portfolio-v1',
    mappingVersion: 'robinhood-read-v1',
    accountCount: included.length,
    accounts: details,
    payload: {
      source: 'robinhood_readonly',
      accountCount: included.length,
      positionCount: details.reduce(
        (count, account) =>
          count + account.equityPositions.length + account.optionPositions.length,
        0,
      ),
      quoteCount: details.reduce(
        (count, account) => count + account.quotes.length,
        0,
      ),
      unsupportedDetailValue: sumMoney(
        included.map((account) => usd(account.unsupportedDetailValue)),
      ).amount,
      quality: {
        mixedMarketState: marketStates.size > 1,
        unsupportedWeight: new Decimal(unsupportedDetailValue.amount).div(totalValue.amount).toFixed(),
        regularSessionCloseEligible: input.phase === 'closed' && input.lastRegularCloseAt != null && freshness.asOf >= input.lastRegularCloseAt,
      },
      sourceWindow: {
        start: freshness.sourceWindowStart,
        end: freshness.sourceWindowEnd,
        maxSkewSeconds: freshness.maxSkewSeconds,
      },
      sourceFingerprint,
      syncCompleteness: 'complete',
      quoteFreshness: freshness.quoteFreshness,
      mappingVersion: 'robinhood-read-v1',
      calculationVersion: 'portfolio-v1',
    },
  };
}
