import type {
  AccountDetailReadModel,
  AccountsReadModel,
  ActivityReadModel,
  AlertsReadModel,
  AnalyticsReadModel,
  DashboardReadModel,
  DataQualityReadModel,
  HoldingDetailReadModel,
  HoldingReadModel,
  HoldingsReadModel,
  PerformanceRange,
  PerformanceReadModel,
  ReconciliationReadModel,
} from '@aurum/domain';
import { ratio, usd } from '@aurum/domain';

export const SYNTHETIC_AS_OF = '2026-08-25T14:14:00.000Z';

const quality: DataQualityReadModel = {
  coverage: 'partial_known_unsupported',
  freshness: 'fresh',
  reconciliation: 'reconciled',
  reasons: ['Options are included in total value but excluded from detailed analytics.'],
};

export const demoAccounts = [
  {
    id: 'acct-synth-individual',
    displayName: 'Individual investing',
    maskedAccountNumber: '•••• 6842',
    status: 'active',
    value: usd('72000'),
    cash: usd('5500'),
    dailyChange: usd('812.34'),
    dailyChangeRatio: ratio('0.0114'),
    allocation: ratio('0.5597'),
    holdingsCount: 6,
    coverage: 'partial_known_unsupported',
  },
  {
    id: 'acct-synth-roth',
    displayName: 'Roth IRA',
    maskedAccountNumber: '•••• 2197',
    status: 'active',
    value: usd('38640.25'),
    cash: usd('3000'),
    dailyChange: usd('328.18'),
    dailyChangeRatio: ratio('0.0086'),
    allocation: ratio('0.3004'),
    holdingsCount: 5,
    coverage: 'complete',
  },
  {
    id: 'acct-synth-cash',
    displayName: 'Cash management',
    maskedAccountNumber: '•••• 9031',
    status: 'active',
    value: usd('18000'),
    cash: usd('3000'),
    dailyChange: usd('144'),
    dailyChangeRatio: ratio('0.0081'),
    allocation: ratio('0.1399'),
    holdingsCount: 3,
    coverage: 'complete',
  },
] satisfies AccountsReadModel['accounts'];

export const demoHoldings: HoldingReadModel[] = [
  {
    instrumentId: 'inst-synth-1',
    symbol: 'SYN1',
    name: 'Nova Grid Systems',
    assetClass: 'Equity',
    quantity: '512',
    marketValue: usd('24882.4'),
    allocation: ratio('0.1934'),
    dailyChange: usd('585.42'),
    dailyChangeRatio: ratio('0.0241'),
    costBasis: usd('19640'),
    unrealizedPnl: usd('5242.4'),
    unrealizedPnlRatio: ratio('0.2669'),
    accounts: [
      {
        accountId: 'acct-synth-individual',
        displayName: 'Individual investing',
        value: usd('14000'),
        allocation: ratio('0.5627'),
      },
      {
        accountId: 'acct-synth-roth',
        displayName: 'Roth IRA',
        value: usd('10882.4'),
        allocation: ratio('0.4373'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-2',
    symbol: 'SYN2',
    name: 'Atlas Compute',
    assetClass: 'Equity',
    quantity: '205',
    marketValue: usd('19765.22'),
    allocation: ratio('0.1536'),
    dailyChange: usd('161.12'),
    dailyChangeRatio: ratio('0.0082'),
    costBasis: usd('17220'),
    unrealizedPnl: usd('2545.22'),
    unrealizedPnlRatio: ratio('0.1478'),
    accounts: [
      {
        accountId: 'acct-synth-individual',
        displayName: 'Individual investing',
        value: usd('19765.22'),
        allocation: ratio('1'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-3',
    symbol: 'SYN3',
    name: 'Lumen Health',
    assetClass: 'Equity',
    quantity: '340',
    marketValue: usd('16320.1'),
    allocation: ratio('0.1269'),
    dailyChange: usd('-59.02'),
    dailyChangeRatio: ratio('-0.0036'),
    costBasis: usd('14810'),
    unrealizedPnl: usd('1510.1'),
    unrealizedPnlRatio: ratio('0.102'),
    accounts: [
      {
        accountId: 'acct-synth-roth',
        displayName: 'Roth IRA',
        value: usd('10000'),
        allocation: ratio('0.6127'),
      },
      {
        accountId: 'acct-synth-cash',
        displayName: 'Cash management',
        value: usd('6320.1'),
        allocation: ratio('0.3873'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-4',
    symbol: 'SYN4',
    name: 'Orbit Materials',
    assetClass: 'Equity',
    quantity: '155',
    marketValue: usd('13405.75'),
    allocation: ratio('0.1042'),
    dailyChange: usd('155.61'),
    dailyChangeRatio: ratio('0.0117'),
    costBasis: usd('12100'),
    unrealizedPnl: usd('1305.75'),
    unrealizedPnlRatio: ratio('0.1079'),
    accounts: [
      {
        accountId: 'acct-synth-individual',
        displayName: 'Individual investing',
        value: usd('8405.75'),
        allocation: ratio('0.627'),
      },
      {
        accountId: 'acct-synth-cash',
        displayName: 'Cash management',
        value: usd('5000'),
        allocation: ratio('0.373'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-5',
    symbol: 'SYN5',
    name: 'Helio Infrastructure',
    assetClass: 'Equity',
    quantity: '91',
    marketValue: usd('10138.71'),
    allocation: ratio('0.0788'),
    dailyChange: usd('-65.28'),
    dailyChangeRatio: ratio('-0.0064'),
    costBasis: usd('9450'),
    unrealizedPnl: usd('688.71'),
    unrealizedPnlRatio: ratio('0.0729'),
    accounts: [
      {
        accountId: 'acct-synth-roth',
        displayName: 'Roth IRA',
        value: usd('10138.71'),
        allocation: ratio('1'),
      },
    ],
    quoteStatus: 'stale',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-etf-1',
    symbol: 'SYDX',
    name: 'Synthetic Broad Market ETF',
    assetClass: 'ETF',
    quantity: '118',
    marketValue: usd('14750'),
    allocation: ratio('0.1147'),
    dailyChange: usd('194.2'),
    dailyChangeRatio: ratio('0.0133'),
    costBasis: usd('13900'),
    unrealizedPnl: usd('850'),
    unrealizedPnlRatio: ratio('0.0612'),
    accounts: [
      {
        accountId: 'acct-synth-individual',
        displayName: 'Individual investing',
        value: usd('9750'),
        allocation: ratio('0.661'),
      },
      {
        accountId: 'acct-synth-roth',
        displayName: 'Roth IRA',
        value: usd('5000'),
        allocation: ratio('0.339'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-etf-2',
    symbol: 'SYBD',
    name: 'Synthetic Treasury ETF',
    assetClass: 'ETF',
    quantity: '92',
    marketValue: usd('11163.07'),
    allocation: ratio('0.0868'),
    dailyChange: usd('112.47'),
    dailyChangeRatio: ratio('0.0102'),
    costBasis: usd('10820'),
    unrealizedPnl: usd('343.07'),
    unrealizedPnlRatio: ratio('0.0317'),
    accounts: [
      {
        accountId: 'acct-synth-individual',
        displayName: 'Individual investing',
        value: usd('6379.03'),
        allocation: ratio('0.5714'),
      },
      {
        accountId: 'acct-synth-cash',
        displayName: 'Cash management',
        value: usd('4784.04'),
        allocation: ratio('0.4286'),
      },
    ],
    quoteStatus: 'fresh',
    support: 'supported',
  },
  {
    instrumentId: 'inst-synth-option',
    symbol: 'SYN1 260918C100',
    name: 'Synthetic option detail',
    assetClass: 'Option',
    quantity: '4',
    marketValue: usd('6715'),
    allocation: ratio('0.0522'),
    dailyChange: null,
    dailyChangeRatio: null,
    costBasis: null,
    unrealizedPnl: null,
    unrealizedPnlRatio: null,
    accounts: [
      {
        accountId: 'acct-synth-individual',
        displayName: 'Individual investing',
        value: usd('6715'),
        allocation: ratio('1'),
      },
    ],
    quoteStatus: 'unavailable',
    support: 'unsupported_detail',
  },
];

const demoTrendRows: ReadonlyArray<readonly [string, string, string, string | null]> = [
  ['2026-08-19T20:00:00.000Z', 'Wed', '124810.4', null],
  ['2026-08-20T20:00:00.000Z', 'Thu', '125442.18', '631.78'],
  ['2026-08-21T20:00:00.000Z', 'Fri', '124962.04', '-480.14'],
  ['2026-08-22T20:00:00.000Z', 'Sat', '126105.33', '1143.29'],
  ['2026-08-23T20:00:00.000Z', 'Sun', '126884.7', '779.37'],
  ['2026-08-24T20:00:00.000Z', 'Mon', '127355.73', '471.03'],
  [SYNTHETIC_AS_OF, 'Today', '128640.25', '1284.52'],
];

export const demoTrend = demoTrendRows.map(([at, label, value, change]) => ({
  at,
  label,
  value: usd(value),
  change: change === null ? null : usd(change),
}));

export const demoAllocation = [
  {
    key: 'equities',
    label: 'Equities',
    kind: 'equity',
    value: usd('84512.18'),
    weight: ratio('0.6569'),
    tone: 'gold',
  },
  {
    key: 'etfs',
    label: 'ETFs',
    kind: 'etf',
    value: usd('25913.07'),
    weight: ratio('0.2014'),
    tone: 'sand',
  },
  {
    key: 'cash',
    label: 'Cash',
    kind: 'cash',
    value: usd('11500'),
    weight: ratio('0.0894'),
    tone: 'slate',
  },
  {
    key: 'unsupported',
    label: 'Unsupported detail',
    kind: 'unsupported_detail',
    value: usd('6715'),
    weight: ratio('0.0522'),
    tone: 'amber',
  },
] satisfies DashboardReadModel['allocation'];

export const demoDashboard: DashboardReadModel = {
  mode: 'demo',
  connectionState: 'synthetic_demo',
  sourceLabel: 'Synthetic Demo',
  portfolioValue: usd('128640.25'),
  dailyChange: usd('1284.52'),
  dailyChangeRatio: ratio('0.0101'),
  accounts: demoAccounts,
  trend: demoTrend,
  allocation: demoAllocation,
  topHoldings: demoHoldings.slice(0, 5),
  insight: {
    title: 'Concentration deserves a closer look',
    body: 'The two largest synthetic positions represent 34.7% of this demo. Review overlap across accounts before making any real-world decision.',
    severity: 'watch',
  },
  quality,
  capabilities: {
    liveBrokerage: false,
    manualRefresh: false,
    imports: true,
    alerts: true,
    readOnly: true,
  },
  asOf: SYNTHETIC_AS_OF,
  generatedAt: SYNTHETIC_AS_OF,
  calculationVersion: 'synthetic-v1',
};

export const demoAccountsModel: AccountsReadModel = {
  mode: 'demo',
  accounts: demoAccounts,
  portfolioValue: usd('128640.25'),
  asOf: SYNTHETIC_AS_OF,
  quality,
};

export function demoAccountDetail(accountId: string): AccountDetailReadModel | null {
  const account = demoAccounts.find((item) => item.id === accountId);
  if (!account) return null;
  return {
    mode: 'demo',
    account,
    holdings: demoHoldings.filter((holding) =>
      holding.accounts.some((item) => item.accountId === accountId),
    ),
    allocation: demoAllocation,
    asOf: SYNTHETIC_AS_OF,
    quality,
  };
}

export const demoHoldingsModel: HoldingsReadModel = {
  mode: 'demo',
  holdings: demoHoldings,
  totalValue: usd('117140.25'),
  asOf: SYNTHETIC_AS_OF,
  quality,
};

export function demoHoldingDetail(
  instrumentId: string,
): HoldingDetailReadModel | null {
  const holding = demoHoldings.find((item) => item.instrumentId === instrumentId);
  return holding
    ? { mode: 'demo', holding, asOf: SYNTHETIC_AS_OF, quality }
    : null;
}

export function demoPerformance(range: PerformanceRange): PerformanceReadModel {
  return {
    mode: 'demo',
    range,
    seriesLabel: 'portfolio_value_change',
    trend: demoTrend,
    startValue: demoTrend[0]!.value,
    endValue: demoTrend.at(-1)!.value,
    change: usd('3829.85'),
    changeRatio: ratio('0.0307'),
    externalFlows: [
      { at: '2026-08-22T14:30:00.000Z', label: 'Synthetic deposit', value: usd('500') },
    ],
    asOf: SYNTHETIC_AS_OF,
    quality,
  };
}

export const demoAnalytics: AnalyticsReadModel = {
  mode: 'demo',
  allocation: demoAllocation,
  largestHolding: demoHoldings[0]!,
  topTwoWeight: ratio('0.347'),
  supportedAssetsWeight: ratio('0.9478'),
  unsupportedDetailValue: usd('6715'),
  quality,
};

export const demoActivity: ActivityReadModel = {
  mode: 'demo',
  items: [
    {
      id: 'activity-synth-sync',
      at: SYNTHETIC_AS_OF,
      kind: 'sync',
      title: 'Synthetic snapshot reconciled',
      description: 'Three fixture accounts passed the deterministic balance check.',
      amount: null,
      accountId: null,
      source: 'synthetic',
    },
    {
      id: 'activity-synth-dividend',
      at: '2026-08-24T15:30:00.000Z',
      kind: 'dividend',
      title: 'Fixture dividend',
      description: 'Invented distribution from SYDX.',
      amount: usd('42.18'),
      accountId: 'acct-synth-roth',
      source: 'synthetic',
    },
    {
      id: 'activity-synth-deposit',
      at: '2026-08-22T14:30:00.000Z',
      kind: 'deposit',
      title: 'Fixture deposit',
      description: 'External flow marker used for the demo performance view.',
      amount: usd('500'),
      accountId: 'acct-synth-individual',
      source: 'synthetic',
    },
  ],
  asOf: SYNTHETIC_AS_OF,
  quality,
};

export const demoReconciliation: ReconciliationReadModel = {
  mode: 'demo',
  accounts: demoAccounts.map((account) => ({
    accountId: account.id,
    displayName: account.displayName,
    providerTotal: account.value,
    modeledTotal: account.value,
    residual: usd('0'),
    tolerance: usd('0.02'),
    state: 'reconciled',
    inclusionReason: 'active synthetic account',
  })),
  asOf: SYNTHETIC_AS_OF,
};

export const demoAlerts: AlertsReadModel = {
  mode: 'demo',
  rulesEnabled: true,
  asOf: SYNTHETIC_AS_OF,
  alerts: [
    {
      id: 'alert-concentration',
      title: 'Top-two concentration above 30%',
      description: 'SYN1 and SYN2 represent 34.7% of the synthetic portfolio.',
      severity: 'watch',
      state: 'new',
      createdAt: SYNTHETIC_AS_OF,
      mutedUntil: null,
      evidence: {
        snapshotId: 'demo-snapshot-current',
        baselineObservationId: 'demo-snapshot-prior-close',
        sourceAsOf: SYNTHETIC_AS_OF,
        observedMoney: null,
        observedRatio: ratio('0.347'),
        thresholdMoney: null,
        thresholdRatio: ratio('0.30'),
        flowAdjustment: usd('0'),
        quality: { freshness: 'fresh', coverage: 'complete', reconciliation: 'reconciled', mixedMarketState: false, unsupportedWeight: ratio('0') },
        calculationVersion: 'synthetic-demo-v1',
        scope: { type: 'portfolio' },
        decisionReason: 'Synthetic top-two concentration exceeded 30%.',
      },
    },
    {
      id: 'alert-quote-stale',
      title: 'One fixture quote is stale',
      description: 'SYN5 keeps its provider market value; quote-only detail is marked stale.',
      severity: 'info',
      state: 'read',
      createdAt: '2026-08-25T14:10:00.000Z',
      mutedUntil: null,
      evidence: {
        snapshotId: 'demo-snapshot-current',
        baselineObservationId: null,
        sourceAsOf: '2026-08-25T14:10:00.000Z',
        observedMoney: null,
        observedRatio: null,
        thresholdMoney: null,
        thresholdRatio: null,
        flowAdjustment: null,
        quality: { freshness: 'stale', coverage: 'complete', reconciliation: 'reconciled', mixedMarketState: false, unsupportedWeight: ratio('0') },
        calculationVersion: 'synthetic-demo-v1',
        scope: { type: 'holding' },
        decisionReason: 'Synthetic quote freshness threshold exceeded.',
      },
    },
  ],
};
