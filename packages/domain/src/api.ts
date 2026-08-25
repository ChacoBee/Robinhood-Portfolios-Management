import type { Money, Ratio } from './money';

export type DataSourceMode = 'demo' | 'connected' | 'disconnected';
export type ConnectionState =
  | 'synthetic_demo'
  | 'live'
  | 'disconnected'
  | 'source_error';
export type DataCoverage = 'complete' | 'partial_known_unsupported' | 'unavailable';
export type DataFreshness = 'fresh' | 'stale' | 'unknown';

export interface DataQualityReadModel {
  coverage: DataCoverage;
  freshness: DataFreshness;
  reconciliation: 'reconciled' | 'partial' | 'unavailable';
  reasons: string[];
}

export interface DataCapabilities {
  liveBrokerage: boolean;
  manualRefresh: boolean;
  imports: boolean;
  alerts: boolean;
  readOnly: true;
}

export interface TrendPointReadModel {
  at: string;
  label: string;
  value: Money;
  change: Money | null;
}

export interface AllocationSliceReadModel {
  key: string;
  label: string;
  kind:
    | 'equity'
    | 'etf'
    | 'cash'
    | 'unsupported_detail'
    | 'residual'
    | 'other';
  value: Money;
  weight: Ratio;
  tone: 'gold' | 'sand' | 'green' | 'amber' | 'slate';
}

export interface AccountSummaryReadModel {
  id: string;
  displayName: string;
  maskedAccountNumber: string | null;
  status: 'active' | 'closed';
  value: Money;
  cash: Money;
  dailyChange: Money | null;
  dailyChangeRatio: Ratio | null;
  allocation: Ratio;
  holdingsCount: number;
  coverage: DataCoverage;
}

export interface HoldingReadModel {
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  quantity: string;
  marketValue: Money;
  allocation: Ratio;
  dailyChange: Money | null;
  dailyChangeRatio: Ratio | null;
  costBasis: Money | null;
  unrealizedPnl: Money | null;
  unrealizedPnlRatio: Ratio | null;
  accounts: Array<{
    accountId: string;
    displayName: string;
    value: Money;
    allocation: Ratio;
  }>;
  quoteStatus: 'fresh' | 'stale' | 'unavailable';
  support: 'supported' | 'unsupported_detail';
}

export interface DashboardReadModel {
  mode: DataSourceMode;
  connectionState: ConnectionState;
  sourceLabel: string;
  portfolioValue: Money | null;
  dailyChange: Money | null;
  dailyChangeRatio: Ratio | null;
  accounts: AccountSummaryReadModel[];
  trend: TrendPointReadModel[];
  allocation: AllocationSliceReadModel[];
  topHoldings: HoldingReadModel[];
  insight: {
    title: string;
    body: string;
    severity: 'info' | 'watch';
  } | null;
  quality: DataQualityReadModel;
  capabilities: DataCapabilities;
  asOf: string | null;
  generatedAt: string;
  calculationVersion: string;
}

export interface AccountsReadModel {
  mode: DataSourceMode;
  accounts: AccountSummaryReadModel[];
  portfolioValue: Money | null;
  asOf: string | null;
  quality: DataQualityReadModel;
}

export interface AccountDetailReadModel {
  mode: DataSourceMode;
  account: AccountSummaryReadModel;
  holdings: HoldingReadModel[];
  allocation: AllocationSliceReadModel[];
  asOf: string | null;
  quality: DataQualityReadModel;
}

export interface HoldingsReadModel {
  mode: DataSourceMode;
  holdings: HoldingReadModel[];
  totalValue: Money | null;
  asOf: string | null;
  quality: DataQualityReadModel;
}

export interface HoldingDetailReadModel {
  mode: DataSourceMode;
  holding: HoldingReadModel;
  asOf: string | null;
  quality: DataQualityReadModel;
}

export type PerformanceRange = '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export interface PerformanceReadModel {
  mode: DataSourceMode;
  range: PerformanceRange;
  seriesLabel: 'portfolio_value_change' | 'flow_adjusted_value_change';
  trend: TrendPointReadModel[];
  startValue: Money | null;
  endValue: Money | null;
  change: Money | null;
  changeRatio: Ratio | null;
  externalFlows: Array<{
    at: string;
    label: string;
    value: Money;
  }>;
  asOf: string | null;
  quality: DataQualityReadModel;
}

export interface AnalyticsReadModel {
  mode: DataSourceMode;
  allocation: AllocationSliceReadModel[];
  largestHolding: HoldingReadModel | null;
  topTwoWeight: Ratio | null;
  supportedAssetsWeight: Ratio | null;
  unsupportedDetailValue: Money;
  quality: DataQualityReadModel;
}

export interface ActivityItemReadModel {
  id: string;
  at: string;
  kind: 'deposit' | 'withdrawal' | 'trade' | 'dividend' | 'sync' | 'import';
  title: string;
  description: string;
  amount: Money | null;
  accountId: string | null;
  source: 'synthetic' | 'robinhood' | 'imported';
}

export interface ActivityReadModel {
  mode: DataSourceMode;
  items: ActivityItemReadModel[];
  asOf: string | null;
  quality: DataQualityReadModel;
}

export interface ReconciliationReadModel {
  mode: DataSourceMode;
  accounts: Array<{
    accountId: string;
    displayName: string;
    providerTotal: Money;
    modeledTotal: Money;
    residual: Money;
    tolerance: Money;
    state: 'reconciled' | 'partial';
    inclusionReason: string;
  }>;
  asOf: string | null;
}

export interface AlertReadModel {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'watch' | 'important';
  state: 'new' | 'read';
  createdAt: string;
  mutedUntil: string | null;
  evidence: {
    snapshotId: string | null;
    baselineObservationId: string | null;
    sourceAsOf: string | null;
    observedMoney: Money | null;
    observedRatio: Ratio | null;
    thresholdMoney: Money | null;
    thresholdRatio: Ratio | null;
    flowAdjustment: Money | null;
    quality: {
      freshness: 'fresh' | 'stale' | 'unknown';
      coverage: 'complete' | 'partial' | 'unsupported' | 'unavailable';
      reconciliation: 'reconciled' | 'partial' | 'unavailable';
      mixedMarketState: boolean;
      unsupportedWeight: Ratio;
    } | null;
    calculationVersion: string | null;
    scope: { type: 'portfolio' | 'account' | 'holding' } | null;
    decisionReason: string | null;
  };
}

export interface AlertsReadModel {
  mode: DataSourceMode;
  alerts: AlertReadModel[];
  rulesEnabled: boolean;
  asOf: string | null;
}

export interface RefreshReadModel {
  state: 'queued' | 'coalesced' | 'disabled';
  jobId: string | null;
  mode: DataSourceMode;
}

export interface HealthReadModel {
  status: 'ok' | 'degraded';
  mode: 'demo' | 'connected';
  database: 'not_used' | 'ready' | 'unavailable';
  worker: 'not_used' | 'healthy' | 'stalled' | 'unavailable';
  provider: 'not_configured' | 'configured' | 'unavailable';
  lastSuccessfulRefreshAt: string | null;
}

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
  generatedAt: string;
}
