import {
  demoAccountDetail,
  demoAccountsModel,
  demoActivity,
  demoAlerts,
  demoAnalytics,
  demoDashboard,
  demoHoldingDetail,
  demoHoldingsModel,
  demoPerformance,
  demoReconciliation,
} from '../demo/dashboard-fixture';
import type { PortfolioDataSource } from './data-source-types';

export function createDemoPortfolioDataSource(): PortfolioDataSource {
  return {
    mode: 'demo',
    dashboard: async () => demoDashboard,
    accounts: async () => demoAccountsModel,
    account: async (accountId) => demoAccountDetail(accountId),
    holdings: async () => demoHoldingsModel,
    holding: async (instrumentId) => demoHoldingDetail(instrumentId),
    performance: async (range) => demoPerformance(range),
    analytics: async () => demoAnalytics,
    activity: async () => demoActivity,
    reconciliation: async () => demoReconciliation,
    alerts: async () => demoAlerts,
    refresh: async () => ({ state: 'disabled', jobId: null, mode: 'demo' }),
  };
}
