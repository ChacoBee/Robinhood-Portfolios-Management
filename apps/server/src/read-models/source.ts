import type {
  AccountDetailReadModel,
  AccountsReadModel,
  ActivityReadModel,
  AlertsReadModel,
  AnalyticsReadModel,
  DashboardReadModel,
  HealthReadModel,
  HoldingDetailReadModel,
  HoldingsReadModel,
  PerformanceRange,
  PerformanceReadModel,
  ReconciliationReadModel,
  RefreshReadModel,
} from '@aurum/domain';

export interface PortfolioReadModelSource {
  getDashboard(): Promise<DashboardReadModel>;
  listAccounts(): Promise<AccountsReadModel>;
  getAccount(accountId: string): Promise<AccountDetailReadModel | null>;
  listHoldings(): Promise<HoldingsReadModel>;
  getHolding(instrumentId: string): Promise<HoldingDetailReadModel | null>;
  getPerformance(range: PerformanceRange): Promise<PerformanceReadModel>;
  getAnalytics(): Promise<AnalyticsReadModel>;
  getActivity(): Promise<ActivityReadModel>;
  getReconciliation(): Promise<ReconciliationReadModel>;
  getAlerts(): Promise<AlertsReadModel>;
  requestRefresh(): Promise<RefreshReadModel>;
  getHealth(): Promise<HealthReadModel>;
}

export interface ReadModelClockOptions {
  now?: () => Date;
}
