import Decimal from 'decimal.js';
import type { AccountTotalKind } from './accounts';
import {
  absoluteMoney,
  addMoney,
  compareMoney,
  maxMoney,
  moneyRatio,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  usd,
  type Money,
  type Ratio,
} from './money';
import type { CostBasisSource, MarketState } from './observations';
import type {
  AccountReconciliation,
  QualityState,
  ReconciliationState,
  ResidualKind,
} from './quality';
import type { TransactionKind } from './transactions';

const SEMANTIC_TOTALS: ReadonlySet<AccountTotalKind> = new Set([
  'provider_portfolio_value',
  'net_liquidation_value',
  'account_equity',
]);

export interface ReconcileAccountInput {
  totalKind: AccountTotalKind;
  providerTotal: Money | null;
  positions: Money;
  cash: Money;
  accrued: Money | null;
  absoluteTolerance: Money;
  residualKind: ResidualKind;
}

function classifyResidual(kind: ResidualKind): ReconciliationState {
  if (kind === 'expected_unsupported') return 'expected_unsupported_residual';
  if (kind === 'timing_difference') return 'timing_difference';
  return 'unexplained_residual';
}

export function reconcileAccount(input: ReconcileAccountInput): AccountReconciliation {
  const modeledTotal =
    input.accrued === null
      ? null
      : addMoney(addMoney(input.positions, input.cash), input.accrued);

  if (
    !SEMANTIC_TOTALS.has(input.totalKind) ||
    input.providerTotal === null ||
    modeledTotal === null
  ) {
    return {
      state: 'not_computable',
      providerTotal: null,
      modeledTotal,
      residual: null,
      effectiveTolerance: null,
      headlineEligible: false,
      allocationEligible: false,
      returnsEligible: false,
      reason:
        input.totalKind === 'unknown'
          ? 'unknown_total_semantics'
          : input.providerTotal === null
            ? 'provider_total_unavailable'
            : 'accrued_component_unavailable',
    };
  }

  const percentageTolerance = multiplyMoney(
    absoluteMoney(input.providerTotal),
    new Decimal('0.0001'),
  );
  const effectiveTolerance = maxMoney(input.absoluteTolerance, percentageTolerance);
  const residual = subtractMoney(input.providerTotal, modeledTotal);

  if (compareMoney(absoluteMoney(residual), effectiveTolerance) <= 0) {
    return {
      state: 'reconciled',
      providerTotal: usd(input.providerTotal.amount),
      modeledTotal,
      residual,
      effectiveTolerance,
      headlineEligible: true,
      allocationEligible: true,
      returnsEligible: true,
      reason: null,
    };
  }

  const state = classifyResidual(input.residualKind);
  const expectedUnsupported = state === 'expected_unsupported_residual';
  const timingDifference = state === 'timing_difference';

  return {
    state,
    providerTotal: usd(input.providerTotal.amount),
    modeledTotal,
    residual,
    effectiveTolerance,
    headlineEligible: expectedUnsupported || timingDifference,
    allocationEligible: expectedUnsupported,
    returnsEligible: expectedUnsupported,
    reason: state,
  };
}

export type DailyChangeTimestampPrecision = 'instant' | 'date';

export interface DailyChangeActivity {
  kind: TransactionKind;
  amount: Money;
  effectiveAt: string;
  timestampPrecision: DailyChangeTimestampPrecision;
}

export interface CalculateDailyChangeInput {
  currentValue: Money;
  currentAsOf: string;
  priorCloseValue: Money | null;
  priorCloseAsOf: string | null;
  snapshotsEligible: boolean;
  flowCoverageComplete: boolean;
  activities: readonly DailyChangeActivity[];
}

export type DailyChangeResult =
  | {
      state: 'available';
      amount: Money;
      ratio: Ratio | null;
      externalFlowAdjustment: Money;
      method: 'flow_adjusted_snapshots';
      label: 'portfolio_value_change' | 'flow_adjusted_value_change';
      quality: 'complete';
    }
  | {
      state: 'unavailable';
      amount: null;
      ratio: null;
      externalFlowAdjustment: null;
      reason: string;
      quality: 'unavailable';
    };

function unavailableDailyChange(reason: string): DailyChangeResult {
  return {
    state: 'unavailable',
    amount: null,
    ratio: null,
    externalFlowAdjustment: null,
    reason,
    quality: 'unavailable',
  };
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateDailyChange(
  input: CalculateDailyChangeInput,
): DailyChangeResult {
  if (input.priorCloseValue === null || input.priorCloseAsOf === null) {
    return unavailableDailyChange('missing_prior_close');
  }
  if (!input.snapshotsEligible) {
    return unavailableDailyChange('snapshot_boundary_ineligible');
  }
  if (!input.flowCoverageComplete) {
    return unavailableDailyChange('flow_coverage_incomplete');
  }

  const priorTimestamp = timestamp(input.priorCloseAsOf);
  const currentTimestamp = timestamp(input.currentAsOf);
  if (
    priorTimestamp === null ||
    currentTimestamp === null ||
    currentTimestamp <= priorTimestamp
  ) {
    return unavailableDailyChange('invalid_snapshot_window');
  }

  const activitiesInWindow = input.activities.filter((activity) => {
    const effectiveAt = timestamp(activity.effectiveAt);
    return (
      effectiveAt !== null &&
      effectiveAt > priorTimestamp &&
      effectiveAt <= currentTimestamp
    );
  });

  if (activitiesInWindow.some((activity) => activity.kind === 'unknown')) {
    return unavailableDailyChange('flow_classification_incomplete');
  }

  const externalActivities = activitiesInWindow.filter(
    (activity) => activity.kind === 'deposit' || activity.kind === 'withdrawal',
  );
  if (externalActivities.some((activity) => activity.timestampPrecision !== 'instant')) {
    return unavailableDailyChange('flow_timestamp_imprecise');
  }
  if (
    externalActivities.some(
      (activity) =>
        (activity.kind === 'deposit' && compareMoney(activity.amount, usd(0)) < 0) ||
        (activity.kind === 'withdrawal' && compareMoney(activity.amount, usd(0)) > 0),
    )
  ) {
    return unavailableDailyChange('invalid_external_flow_sign');
  }

  const externalFlowAdjustment = sumMoney(
    externalActivities.map((activity) => activity.amount),
  );
  const amount = subtractMoney(
    subtractMoney(input.currentValue, input.priorCloseValue),
    externalFlowAdjustment,
  );
  const hasExternalFlow = compareMoney(externalFlowAdjustment, usd(0)) !== 0;
  const ratioValue =
    !hasExternalFlow && compareMoney(input.priorCloseValue, usd(0)) > 0
      ? moneyRatio(amount, input.priorCloseValue)
      : null;

  return {
    state: 'available',
    amount,
    ratio: ratioValue,
    externalFlowAdjustment,
    method: 'flow_adjusted_snapshots',
    label: hasExternalFlow
      ? 'flow_adjusted_value_change'
      : 'portfolio_value_change',
    quality: 'complete',
  };
}

export type AllocationSliceKind =
  | 'classified'
  | 'cash'
  | 'unclassified'
  | 'unsupported_detail'
  | 'residual'
  | 'liability';

export interface AllocationInputSlice {
  key: string;
  label: string;
  kind: AllocationSliceKind;
  value: Money;
}

export interface AllocationSlice extends AllocationInputSlice {
  weight: Ratio | null;
}

export type AllocationResult =
  | {
      state: 'available';
      scope: 'whole_portfolio' | 'supported_assets_only';
      denominator: Money;
      quality: 'complete' | 'partial';
      concentrationEligible: boolean;
      chartEligible: boolean;
      slices: AllocationSlice[];
    }
  | {
      state: 'unavailable';
      scope: 'whole_portfolio' | 'supported_assets_only';
      denominator: null;
      quality: 'unavailable';
      concentrationEligible: false;
      chartEligible: false;
      slices: [];
      reason: string;
    };

export interface CalculateAllocationInput {
  providerTotal: Money | null;
  headlineEligible: boolean;
  slices: readonly AllocationInputSlice[];
}

export function calculateAllocation(input: CalculateAllocationInput): AllocationResult {
  const wholePortfolio = input.providerTotal !== null && input.headlineEligible;
  const scope = wholePortfolio ? 'whole_portfolio' : 'supported_assets_only';
  const includedSlices = wholePortfolio
    ? [...input.slices]
    : input.slices.filter(
        (slice) => slice.kind !== 'residual' && slice.kind !== 'unsupported_detail',
      );
  const denominator = wholePortfolio
    ? input.providerTotal
    : sumMoney(includedSlices.map((slice) => slice.value));

  if (denominator === null || compareMoney(denominator, usd(0)) <= 0) {
    return {
      state: 'unavailable',
      scope,
      denominator: null,
      quality: 'unavailable',
      concentrationEligible: false,
      chartEligible: false,
      slices: [],
      reason: 'allocation_denominator_unavailable',
    };
  }

  if (
    wholePortfolio &&
    compareMoney(sumMoney(includedSlices.map((slice) => slice.value)), denominator) !== 0
  ) {
    return {
      state: 'unavailable',
      scope,
      denominator: null,
      quality: 'unavailable',
      concentrationEligible: false,
      chartEligible: false,
      slices: [],
      reason: 'allocation_slices_do_not_reconcile',
    };
  }

  const chartEligible = includedSlices.every(
    (slice) => compareMoney(slice.value, usd(0)) >= 0,
  );
  const containsPartialSlice = includedSlices.some((slice) =>
    ['unclassified', 'unsupported_detail', 'residual'].includes(slice.kind),
  );

  return {
    state: 'available',
    scope,
    denominator,
    quality: !wholePortfolio || containsPartialSlice ? 'partial' : 'complete',
    concentrationEligible: wholePortfolio,
    chartEligible,
    slices: includedSlices.map((slice) => ({
      ...slice,
      weight: moneyRatio(slice.value, denominator),
    })),
  };
}

export interface PositionValueObservation {
  value: Money;
  asOf: string;
  marketState: MarketState;
  quality: QualityState;
}

export interface PositionQuote {
  price: Money;
  asOf: string;
  marketState: MarketState;
  quality: QualityState;
}

export interface SelectPositionValuationInput {
  providerValue: PositionValueObservation | null;
  quantity: string;
  quote: PositionQuote | null;
  snapshotAsOf: string;
  snapshotMarketState: MarketState;
  maxQuoteAgeSeconds: number;
}

export type PositionValuation =
  | {
      state: 'available' | 'stale';
      value: Money;
      source: 'provider_market_value' | 'quote_times_quantity';
      sourceAsOf: string;
      marketState: MarketState;
      calculationEligible: boolean;
      quality: 'complete' | 'stale';
    }
  | {
      state: 'unavailable';
      value: null;
      source: 'unavailable';
      sourceAsOf: null;
      marketState: MarketState;
      calculationEligible: false;
      quality: 'unavailable';
      reason: string;
    };

function unavailableValuation(
  marketState: MarketState,
  reason: string,
): PositionValuation {
  return {
    state: 'unavailable',
    value: null,
    source: 'unavailable',
    sourceAsOf: null,
    marketState,
    calculationEligible: false,
    quality: 'unavailable',
    reason,
  };
}

export function selectPositionValuation(
  input: SelectPositionValuationInput,
): PositionValuation {
  if (input.providerValue !== null) {
    if (input.providerValue.quality === 'stale') {
      return {
        state: 'stale',
        value: usd(input.providerValue.value.amount),
        source: 'provider_market_value',
        sourceAsOf: input.providerValue.asOf,
        marketState: input.providerValue.marketState,
        calculationEligible: false,
        quality: 'stale',
      };
    }

    if (
      input.providerValue.quality === 'complete' ||
      input.providerValue.quality === 'reconciled'
    ) {
      return {
        state: 'available',
        value: usd(input.providerValue.value.amount),
        source: 'provider_market_value',
        sourceAsOf: input.providerValue.asOf,
        marketState: input.providerValue.marketState,
        calculationEligible: true,
        quality: 'complete',
      };
    }

    return unavailableValuation(
      input.providerValue.marketState,
      'provider_value_not_usable',
    );
  }

  if (input.quote === null) {
    return unavailableValuation(input.snapshotMarketState, 'missing_provider_value_and_quote');
  }
  if (input.quote.quality === 'stale') {
    return unavailableValuation(input.snapshotMarketState, 'stale_quote');
  }
  if (input.quote.quality !== 'complete') {
    return unavailableValuation(input.snapshotMarketState, 'quote_not_usable');
  }
  if (
    input.snapshotMarketState === 'unknown' ||
    input.quote.marketState !== input.snapshotMarketState
  ) {
    return unavailableValuation(input.snapshotMarketState, 'incompatible_market_state');
  }

  const snapshotTimestamp = timestamp(input.snapshotAsOf);
  const quoteTimestamp = timestamp(input.quote.asOf);
  if (snapshotTimestamp === null || quoteTimestamp === null) {
    return unavailableValuation(input.snapshotMarketState, 'invalid_quote_timestamp');
  }
  const quoteAgeSeconds = (snapshotTimestamp - quoteTimestamp) / 1000;
  if (quoteAgeSeconds < 0) {
    return unavailableValuation(input.snapshotMarketState, 'quote_after_snapshot');
  }
  if (quoteAgeSeconds > input.maxQuoteAgeSeconds) {
    return unavailableValuation(input.snapshotMarketState, 'stale_quote');
  }

  let value: Money;
  try {
    value = multiplyMoney(input.quote.price, input.quantity);
  } catch {
    return unavailableValuation(input.snapshotMarketState, 'invalid_quantity');
  }

  return {
    state: 'available',
    value,
    source: 'quote_times_quantity',
    sourceAsOf: input.quote.asOf,
    marketState: input.quote.marketState,
    calculationEligible: true,
    quality: 'complete',
  };
}

export interface CalculateUnrealizedPnlInput {
  valuation: PositionValuation;
  costBasis: Money | null;
  costBasisSource: CostBasisSource;
  basisKnown: boolean;
}

export type UnrealizedPnl =
  | {
      state: 'available';
      amount: Money;
      ratio: Ratio | null;
      basisSource: CostBasisSource;
      quality: 'complete';
      taxGrade: false;
    }
  | {
      state: 'unavailable';
      amount: null;
      ratio: null;
      basisSource: CostBasisSource;
      quality: 'unavailable';
      taxGrade: false;
      reason: string;
    };

function unavailablePnl(
  basisSource: CostBasisSource,
  reason: string,
): UnrealizedPnl {
  return {
    state: 'unavailable',
    amount: null,
    ratio: null,
    basisSource,
    quality: 'unavailable',
    taxGrade: false,
    reason,
  };
}

export function calculateUnrealizedPnl(
  input: CalculateUnrealizedPnlInput,
): UnrealizedPnl {
  if (input.valuation.state !== 'available' || !input.valuation.calculationEligible) {
    return unavailablePnl(input.costBasisSource, 'valuation_unavailable');
  }
  if (!input.basisKnown || input.costBasis === null || input.costBasisSource === 'unavailable') {
    return unavailablePnl(input.costBasisSource, 'missing_cost_basis');
  }
  if (input.costBasisSource === 'calculated_partial') {
    return unavailablePnl(input.costBasisSource, 'partial_cost_basis');
  }
  if (compareMoney(input.costBasis, usd(0)) < 0) {
    return unavailablePnl(input.costBasisSource, 'invalid_cost_basis');
  }

  const amount = subtractMoney(input.valuation.value, input.costBasis);
  return {
    state: 'available',
    amount,
    ratio: moneyRatio(amount, input.costBasis),
    basisSource: input.costBasisSource,
    quality: 'complete',
    taxGrade: false,
  };
}
