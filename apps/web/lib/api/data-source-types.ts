import type {
  AccountDetailReadModel,
  AccountsReadModel,
  ActivityReadModel,
  AlertsReadModel,
  AnalyticsReadModel,
  DashboardReadModel,
  HoldingDetailReadModel,
  HoldingsReadModel,
  PerformanceRange,
  PerformanceReadModel,
  ReconciliationReadModel,
  RefreshReadModel,
} from '@aurum/domain';

export interface PortfolioDataSource {
  readonly mode: 'demo' | 'connected';
  dashboard(): Promise<DashboardReadModel>;
  accounts(): Promise<AccountsReadModel>;
  account(accountId: string): Promise<AccountDetailReadModel | null>;
  holdings(): Promise<HoldingsReadModel>;
  holding(instrumentId: string): Promise<HoldingDetailReadModel | null>;
  performance(range: PerformanceRange): Promise<PerformanceReadModel>;
  analytics(): Promise<AnalyticsReadModel>;
  activity(): Promise<ActivityReadModel>;
  reconciliation(): Promise<ReconciliationReadModel>;
  alerts(): Promise<AlertsReadModel>;
  refresh(): Promise<RefreshReadModel>;
}
