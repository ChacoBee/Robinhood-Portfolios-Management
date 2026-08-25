import {
  ratio,
  subtractMoney,
  usd,
  type AccountDetailReadModel,
  type AccountSummaryReadModel,
  type ActivityReadModel,
  type AlertsReadModel,
  type AllocationSliceReadModel,
  type AnalyticsReadModel,
  type DashboardReadModel,
  type DataQualityReadModel,
  type HealthReadModel,
  type HoldingDetailReadModel,
  type HoldingReadModel,
  type PerformanceRange,
  type PerformanceReadModel,
  type ReconciliationReadModel,
  type TrendPointReadModel,
} from '@aurum/domain';
import type {
  PortfolioReadModelSource,
  ReadModelClockOptions,
} from './source';

const asOf = '2026-08-25T14:55:00.000Z';

const quality: DataQualityReadModel = {
  coverage: 'complete',
  freshness: 'fresh',
  reconciliation: 'reconciled',
  reasons: ['synthetic_demo_data'],
};

const accounts: AccountSummaryReadModel[] = [
  {
    id: 'demo-taxable',
    displayName: 'Individual brokerage',
    maskedAccountNumber: '•••• 4821',
    status: 'active',
    value: usd('124850.42'),
    cash: usd('7850.42'),
    dailyChange: usd('1384.16'),
    dailyChangeRatio: ratio('0.0112'),
    allocation: ratio('0.6841'),
    holdingsCount: 3,
    coverage: 'complete',
  },
  {
    id: 'demo-roth',
    displayName: 'Roth IRA',
    maskedAccountNumber: '•••• 7310',
    status: 'active',
    value: usd('57649.58'),
    cash: usd('2649.58'),
    dailyChange: usd('418.22'),
    dailyChangeRatio: ratio('0.0073'),
    allocation: ratio('0.3159'),
    holdingsCount: 2,
    coverage: 'complete',
  },
];

const holdings: HoldingReadModel[] = [
  {
    instrumentId: 'demo-aurx',
    symbol: 'AURX',
    name: 'Aurum Systems',
    assetClass: 'equity',
    quantity: '410',
    marketValue: usd('58500'),
    allocation: ratio('0.3205'),
    dailyChange: usd('936'),
    dailyChangeRatio: ratio('0.0163'),
    costBasis: usd('41200'),
    unrealizedPnl: usd('17300'),
    unrealizedPnlRatio: ratio('0.4199'),
    accounts: [
      {
        accountId: 'demo-taxable',
        displayName: 'Individual brokerage',
        value: usd('58500'),
        allocation: ratio('0.3205'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'demo-vexa',
    symbol: 'VEXA',
    name: 'Vexa Market Fund',
    assetClass: 'etf',
    quantity: '220',
    marketValue: usd('55000'),
    allocation: ratio('0.3014'),
    dailyChange: usd('401.5'),
    dailyChangeRatio: ratio('0.0074'),
    costBasis: usd('47190'),
    unrealizedPnl: usd('7810'),
    unrealizedPnlRatio: ratio('0.1655'),
    accounts: [
      {
        accountId: 'demo-roth',
        displayName: 'Roth IRA',
        value: usd('55000'),
        allocation: ratio('0.3014'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'demo-nova',
    symbol: 'NOVA',
    name: 'Nova Devices',
    assetClass: 'equity',
    quantity: '250',
    marketValue: usd('58500'),
    allocation: ratio('0.3205'),
    dailyChange: usd('464.88'),
    dailyChangeRatio: ratio('0.008'),
    costBasis: usd('48950'),
    unrealizedPnl: usd('9550'),
    unrealizedPnlRatio: ratio('0.1951'),
    accounts: [
      {
        accountId: 'demo-taxable',
        displayName: 'Individual brokerage',
        value: usd('58500'),
        allocation: ratio('0.3205'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
];

const allocation: AllocationSliceReadModel[] = [
  {
    key: 'equity',
    label: 'Individual equities',
    kind: 'equity',
    value: usd('117000'),
    weight: ratio('0.6411'),
    tone: 'gold',
  },
  {
    key: 'etf',
    label: 'ETFs',
    kind: 'etf',
    value: usd('55000'),
    weight: ratio('0.3014'),
    tone: 'sand',
  },
  {
    key: 'cash',
    label: 'Cash',
    kind: 'cash',
    value: usd('10500'),
    weight: ratio('0.0575'),
    tone: 'slate',
  },
];

const trend: TrendPointReadModel[] = [
  ['2026-07-25T20:00:00.000Z', 'Jul 25', '169400', null],
  ['2026-08-01T20:00:00.000Z', 'Aug 1', '171860', '2460'],
  ['2026-08-08T20:00:00.000Z', 'Aug 8', '174910', '3050'],
  ['2026-08-15T20:00:00.000Z', 'Aug 15', '178120', '3210'],
  ['2026-08-22T20:00:00.000Z', 'Aug 22', '180697.62', '2577.62'],
  [asOf, 'Today', '182500', '1802.38'],
].map(([at, label, value, change]) => ({
  at: at!,
  label: label!,
  value: usd(value!),
  change: change === null ? null : usd(change!),
}));

function accountDetail(accountId: string): AccountDetailReadModel | null {
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) return null;
  const accountHoldings = holdings
    .filter((holding) =>
      holding.accounts.some((entry) => entry.accountId === accountId),
    )
    .map((holding) => ({
      ...holding,
      accounts: holding.accounts.filter((entry) => entry.accountId === accountId),
    }));
  return {
    mode: 'demo',
    account,
    holdings: accountHoldings,
    allocation: allocation.filter((slice) =>
      accountId === 'demo-roth'
        ? slice.key === 'etf' || slice.key === 'cash'
        : slice.key !== 'etf',
    ),
    asOf,
    quality,
  };
}

export function createDemoReadModelSource(
  options: ReadModelClockOptions = {},
): PortfolioReadModelSource {
  const now = options.now ?? (() => new Date());
  const sourceGeneratedAt = now().toISOString();

  const dashboard = (): DashboardReadModel => ({
    mode: 'demo',
    connectionState: 'synthetic_demo',
    sourceLabel: 'Synthetic Demo — no brokerage connected',
    portfolioValue: usd('182500'),
    dailyChange: usd('1802.38'),
    dailyChangeRatio: ratio('0.00997'),
    accounts,
    trend,
    allocation,
    topHoldings: holdings,
    insight: {
      title: 'Concentration watch',
      body: 'The two largest synthetic positions represent 62.2% of this demo portfolio.',
      severity: 'watch',
    },
    quality,
    capabilities: {
      liveBrokerage: false,
      manualRefresh: false,
      imports: false,
      alerts: true,
      readOnly: true,
    },
    asOf,
    generatedAt: sourceGeneratedAt,
    calculationVersion: 'demo-v1',
  });

  return {
    async getDashboard() {
      return dashboard();
    },
    async listAccounts() {
      return {
        mode: 'demo',
        accounts,
        portfolioValue: usd('182500'),
        asOf,
        quality,
      };
    },
    async getAccount(accountId) {
      return accountDetail(accountId);
    },
    async listHoldings() {
      return {
        mode: 'demo',
        holdings,
        totalValue: usd('172000'),
        asOf,
        quality,
      };
    },
    async getHolding(instrumentId): Promise<HoldingDetailReadModel | null> {
      const holding = holdings.find(
        (candidate) => candidate.instrumentId === instrumentId,
      );
      return holding ? { mode: 'demo', holding, asOf, quality } : null;
    },
    async getPerformance(range): Promise<PerformanceReadModel> {
      const startValue = trend[0]?.value ?? null;
      const endValue = trend.at(-1)?.value ?? null;
      const change =
        startValue && endValue ? subtractMoney(endValue, startValue) : null;
      return {
        mode: 'demo',
        range,
        seriesLabel: 'portfolio_value_change',
        trend,
        startValue,
        endValue,
        change,
        changeRatio: ratio('0.07733'),
        externalFlows: [
          {
            at: '2026-08-05T14:00:00.000Z',
            label: 'Synthetic deposit',
            value: usd('1000'),
          },
        ],
        asOf,
        quality,
      };
    },
    async getAnalytics(): Promise<AnalyticsReadModel> {
      return {
        mode: 'demo',
        allocation,
        largestHolding: holdings[0] ?? null,
        topTwoWeight: ratio('0.6219'),
        supportedAssetsWeight: ratio('1'),
        unsupportedDetailValue: usd('0'),
        quality,
      };
    },
    async getActivity(): Promise<ActivityReadModel> {
      return {
        mode: 'demo',
        items: [
          {
            id: 'demo-sync-1',
            at: asOf,
            kind: 'sync',
            title: 'Demo data refreshed',
            description: 'Synthetic portfolio fixture loaded.',
            amount: null,
            accountId: null,
            source: 'synthetic',
          },
          {
            id: 'demo-deposit-1',
            at: '2026-08-05T14:00:00.000Z',
            kind: 'deposit',
            title: 'Synthetic deposit',
            description: 'Example cash contribution.',
            amount: usd('1000'),
            accountId: 'demo-taxable',
            source: 'synthetic',
          },
        ],
        asOf,
        quality,
      };
    },
    async getReconciliation(): Promise<ReconciliationReadModel> {
      return {
        mode: 'demo',
        accounts: accounts.map((account) => ({
          accountId: account.id,
          displayName: account.displayName,
          providerTotal: account.value,
          modeledTotal: account.value,
          residual: usd('0'),
          tolerance: usd('0.02'),
          state: 'reconciled',
          inclusionReason: 'Synthetic values balance exactly.',
        })),
        asOf,
      };
    },
    async getAlerts(): Promise<AlertsReadModel> {
      return {
        mode: 'demo',
        alerts: [
          {
            id: 'demo-alert-1',
            title: 'Concentration watch',
            description: 'Two synthetic positions exceed 60% of portfolio value.',
            severity: 'watch',
            state: 'new',
            createdAt: '2026-08-25T15:00:00.000Z',
            mutedUntil: null,
            evidence: {
              snapshotId: 'demo-snapshot-current',
              baselineObservationId: 'demo-snapshot-prior-close',
              sourceAsOf: asOf,
              observedMoney: null,
              observedRatio: ratio('0.347'),
              thresholdMoney: null,
              thresholdRatio: ratio('0.30'),
              flowAdjustment: usd('0'),
              quality: {
                freshness: 'fresh', coverage: 'complete', reconciliation: 'reconciled',
                mixedMarketState: false, unsupportedWeight: ratio('0'),
              },
              calculationVersion: 'synthetic-demo-v1',
              scope: { type: 'portfolio' },
              decisionReason: 'Synthetic concentration threshold exceeded.',
            },
          },
        ],
        rulesEnabled: true,
        asOf,
      };
    },
    async requestRefresh() {
      return { state: 'disabled', jobId: null, mode: 'demo' };
    },
    async getHealth(): Promise<HealthReadModel> {
      return {
        status: 'ok',
        mode: 'demo',
        database: 'not_used',
        worker: 'not_used',
        provider: 'not_configured',
        lastSuccessfulRefreshAt: null,
      };
    },
  };
}
