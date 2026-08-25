import type { PerformanceRange } from '@aurum/domain';
import { ReadModelSourceError } from './errors';
import type { PortfolioReadModelSource } from './source';

function unavailable(): never {
  throw new ReadModelSourceError('source_unavailable', 503);
}

export function createUnavailableConnectedReadModelSource(): PortfolioReadModelSource {
  return {
    async getDashboard() {
      return unavailable();
    },
    async listAccounts() {
      return unavailable();
    },
    async getAccount(_accountId: string) {
      return unavailable();
    },
    async listHoldings() {
      return unavailable();
    },
    async getHolding(_instrumentId: string) {
      return unavailable();
    },
    async getPerformance(_range: PerformanceRange) {
      return unavailable();
    },
    async getAnalytics() {
      return unavailable();
    },
    async getActivity() {
      return unavailable();
    },
    async getReconciliation() {
      return unavailable();
    },
    async getAlerts() {
      return unavailable();
    },
    async requestRefresh() {
      return { state: 'disabled', jobId: null, mode: 'connected' } as const;
    },
    async getHealth() {
      return {
        status: 'degraded',
        mode: 'connected',
        database: 'unavailable',
        worker: 'unavailable',
        provider: 'unavailable',
        lastSuccessfulRefreshAt: null,
      } as const;
    },
  };
}
