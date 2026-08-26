import Decimal from 'decimal.js';
import {
  calculateDailyChange,
  ratio,
  usd,
  type AccountDetailReadModel,
  type AccountSummaryReadModel,
  type ActivityItemReadModel,
  type ActivityReadModel,
  type AlertsReadModel,
  type AllocationSliceReadModel,
  type AnalyticsReadModel,
  type DashboardReadModel,
  type DataCoverage,
  type DataFreshness,
  type DataQualityReadModel,
  type HoldingDetailReadModel,
  type HoldingReadModel,
  type PerformanceRange,
  type PerformanceReadModel,
  type Money,
  type Ratio,
  type ReconciliationReadModel,
  type TrendPointReadModel,
  type TransactionKind,
} from '@aurum/domain';
import type { DatabaseClient } from '../db/client';
import type { JobRepository } from '../db/jobs';
import { evaluateConnectedHealth } from '../operations/health';
import { resolveUsEquitySession } from '../sync/market-calendar';
import { ReadModelSourceError } from './errors';
import type { PortfolioReadModelSource } from './source';

export interface ConnectedHealthProbeResult {
  providerVerified: boolean;
  workerHeartbeatAt: string | null;
}

export interface ConnectedReadModelOptions {
  database: DatabaseClient;
  jobs: JobRepository;
  ownerEmail: string;
  now?: () => Date;
  healthProbe?: () => Promise<ConnectedHealthProbeResult>;
}

interface OwnerRow {
  id: string;
}

interface SnapshotRow {
  id: string;
  sync_run_id: string;
  total_value: string | number;
  as_of: string | Date;
  coverage: string;
  freshness: string;
  reconciliation_status: string;
  calculation_version: string;
  payload: Record<string, unknown> | string;
}

interface AccountRow {
  id: string;
  display_name: string;
  masked_account_number: string | null;
  status: string;
  provider_total: string | number | null;
  modeled_total: string | number | null;
  residual: string | number | null;
  tolerance: string | number | null;
  cash_value: string | number | null;
  unsupported_detail_value: string | number | null;
  inclusion_reason: string;
  quality: string;
}

interface PositionRow {
  instrument_id: string;
  account_id: string;
  account_name: string;
  symbol: string;
  name: string;
  asset_class: string;
  supported: boolean;
  quantity: string | number;
  market_value: string | number | null;
  cost_basis: string | number | null;
  quote_quality: string | null;
}

interface OptionRow {
  account_id: string;
  account_name: string;
  quantity: string | number;
  market_value: string | number;
}

interface HistoryRow {
  total_value: string | number;
  as_of: string | Date;
}

interface DailyBoundaryRow extends HistoryRow {
  coverage: string;
  reconciliation_status: string;
}

interface DailyActivityRow {
  kind: string;
  amount: string | number;
  effective_at: string | Date;
  import_batch_id: string | null;
  provenance: Record<string, unknown> | string;
}

interface TransactionRow {
  id: string;
  account_id: string;
  kind: string;
  amount: string | number;
  effective_at: string | Date;
  description: string;
  imported: boolean;
}

interface SyncActivityRow {
  id: string;
  status: string;
  trigger: string;
  started_at: string | Date;
  completed_at: string | Date | null;
}

interface AlertRow {
  id: string;
  kind: string;
  state: string;
  read_at: string | Date | null;
  created_at: string | Date;
  muted_until: string | Date | null;
  snapshot_id: string | null;
  evidence: Record<string, unknown> | string;
}

interface ConnectedContext {
  ownerId: string;
  snapshot: SnapshotRow;
  payload: Record<string, unknown>;
  accounts: AccountRow[];
  positions: PositionRow[];
  optionPositions: OptionRow[];
  holdings: HoldingReadModel[];
  quality: DataQualityReadModel;
  latestSyncFailed: boolean;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function decimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined) {
    throw new ReadModelSourceError('source_unavailable', 503);
  }
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) {
      throw new Error('non_finite_financial_value');
    }
    return parsed;
  } catch (error) {
    if (error instanceof ReadModelSourceError) throw error;
    throw new ReadModelSourceError('source_unavailable', 503);
  }
}

function decimalString(value: Decimal.Value): string {
  const parsed = new Decimal(value);
  return parsed.isZero() ? '0' : parsed.toFixed();
}

function publicMaskedAccountNumber(value: string | null): string | null {
  if (value === null) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return `•••• ${digits.slice(-4)}`;
}

function safeRatio(numerator: Decimal.Value, denominator: Decimal.Value): Ratio | null {
  const denominatorDecimal = new Decimal(denominator);
  if (denominatorDecimal.isZero()) return null;
  return ratio(new Decimal(numerator).dividedBy(denominatorDecimal).toFixed());
}

function parsedPayload(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== 'string') return value;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function publicMoney(value: unknown): Money | null {
  const candidate = record(value);
  if (candidate?.currency !== 'USD' || typeof candidate.amount !== 'string') return null;
  try {
    return usd(candidate.amount);
  } catch {
    return null;
  }
}

function publicRatio(value: unknown): Ratio | null {
  const candidate = record(value);
  if (typeof candidate?.value !== 'string') return null;
  try {
    return ratio(candidate.value);
  } catch {
    return null;
  }
}

function publicAlertQuality(value: unknown) {
  const candidate = record(value);
  const freshnessValues = new Set(['fresh', 'stale', 'unknown']);
  const coverageValues = new Set(['complete', 'partial', 'unsupported', 'unavailable']);
  const reconciliationValues = new Set(['reconciled', 'partial', 'unavailable']);
  const unsupportedWeight = publicRatio(candidate?.unsupportedWeight);
  if (
    !candidate ||
    !freshnessValues.has(String(candidate.freshness)) ||
    !coverageValues.has(String(candidate.coverage)) ||
    !reconciliationValues.has(String(candidate.reconciliation)) ||
    typeof candidate.mixedMarketState !== 'boolean' ||
    !unsupportedWeight
  ) return null;
  return {
    freshness: candidate.freshness as 'fresh' | 'stale' | 'unknown',
    coverage: candidate.coverage as 'complete' | 'partial' | 'unsupported' | 'unavailable',
    reconciliation: candidate.reconciliation as 'reconciled' | 'partial' | 'unavailable',
    mixedMarketState: candidate.mixedMarketState,
    unsupportedWeight,
  };
}

function publicAlertScope(
  value: unknown,
): { type: 'portfolio' | 'account' | 'holding' } | null {
  const candidate = record(value);
  return candidate && (
    candidate.type === 'portfolio' || candidate.type === 'account' || candidate.type === 'holding'
  ) ? { type: candidate.type as 'portfolio' | 'account' | 'holding' } : null;
}

function coverage(value: string): DataCoverage {
  if (value === 'complete' || value === 'partial_known_unsupported') return value;
  return 'unavailable';
}

function freshness(value: string): DataFreshness {
  if (value === 'fresh' || value === 'stale') return value;
  return 'unknown';
}

function freshnessAtRead(
  stored: string,
  asOf: string | Date,
  currentTime: Date,
): DataFreshness {
  const persisted = freshness(stored);
  if (persisted !== 'fresh') return persisted;
  const sourceTime = new Date(asOf).getTime();
  if (!Number.isFinite(sourceTime) || sourceTime > currentTime.getTime() + 5_000) {
    return 'unknown';
  }
  const session = resolveUsEquitySession(currentTime);
  if (session.phase === 'closed' || session.phase === 'holiday') {
    const afterLastClose = sourceTime >= new Date(session.lastRegularCloseAt).getTime();
    const withinOffHoursBound =
      currentTime.getTime() - sourceTime <= 2 * 60 * 60 * 1_000;
    return afterLastClose && withinOffHoursBound ? 'fresh' : 'stale';
  }
  const maximumAgeSeconds = session.phase === 'regular' ? 120 : 900;
  return currentTime.getTime() - sourceTime <= maximumAgeSeconds * 1_000
    ? 'fresh'
    : 'stale';
}

const transactionKinds = new Set<TransactionKind>([
  'deposit',
  'withdrawal',
  'dividend',
  'interest',
  'fee',
  'trade',
  'internal_transfer',
  'corporate_action',
  'unknown',
]);

function transactionKind(value: string): TransactionKind {
  return transactionKinds.has(value as TransactionKind)
    ? (value as TransactionKind)
    : 'unknown';
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function rangeStart(range: PerformanceRange, end: Date): Date | null {
  if (range === 'ALL') return null;
  if (range === 'YTD') return new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  const days = { '1W': 7, '1M': 31, '3M': 93, '1Y': 366 }[range];
  return new Date(end.getTime() - days * 86_400_000);
}

function kindForAsset(
  assetClass: string,
  supported: boolean,
): AllocationSliceReadModel['kind'] {
  if (!supported) return 'unsupported_detail';
  const normalized = assetClass.toLowerCase();
  if (normalized === 'etf') return 'etf';
  if (normalized === 'equity' || normalized === 'stock') return 'equity';
  return 'other';
}

function allocationTone(
  kind: AllocationSliceReadModel['kind'],
): AllocationSliceReadModel['tone'] {
  if (kind === 'equity') return 'gold';
  if (kind === 'etf') return 'sand';
  if (kind === 'cash') return 'slate';
  if (kind === 'unsupported_detail' || kind === 'residual') return 'amber';
  return 'slate';
}

function allocationLabel(kind: AllocationSliceReadModel['kind']): string {
  return {
    equity: 'Individual equities',
    etf: 'ETFs',
    cash: 'Cash',
    unsupported_detail: 'Unsupported detail',
    residual: 'Residual',
    other: 'Other assets',
  }[kind];
}

function buildAllocation(
  holdings: readonly HoldingReadModel[],
  cashValue: Decimal,
  denominator: Decimal,
): AllocationSliceReadModel[] {
  const totals = new Map<AllocationSliceReadModel['kind'], Decimal>();
  for (const holding of holdings) {
    const kind = kindForAsset(
      holding.assetClass,
      holding.support === 'supported',
    );
    totals.set(kind, (totals.get(kind) ?? new Decimal(0)).plus(holding.marketValue.amount));
  }
  if (!cashValue.isZero()) totals.set('cash', cashValue);
  const represented = [...totals.values()].reduce(
    (sum, value) => sum.plus(value),
    new Decimal(0),
  );
  const residual = denominator.minus(represented);
  if (!residual.isZero()) totals.set('residual', residual);
  return [...totals.entries()]
    .filter(([, value]) => !value.isZero())
    .sort((left, right) => right[1].comparedTo(left[1]))
    .map(([kind, value]) => ({
      key: kind,
      label: allocationLabel(kind),
      kind,
      value: usd(value.toFixed()),
      weight: safeRatio(value, denominator) ?? ratio('0'),
      tone: allocationTone(kind),
    }));
}

function publicTransactionKind(kind: string): ActivityItemReadModel['kind'] {
  if (kind === 'deposit' || kind === 'withdrawal' || kind === 'dividend') return kind;
  return 'trade';
}

function alertCopy(kind: string): {
  title: string;
  description: string;
  severity: 'info' | 'watch' | 'important';
} {
  if (kind.includes('concentration')) {
    return {
      title: 'Concentration watch',
      description: 'A configured concentration threshold was reached.',
      severity: 'watch',
    };
  }
  if (kind.includes('stale') || kind.includes('sync')) {
    return {
      title: 'Data freshness notice',
      description: 'Portfolio data needs attention.',
      severity: 'important',
    };
  }
  return {
    title: 'Portfolio notice',
    description: 'A configured portfolio rule was triggered.',
    severity: 'info',
  };
}

export function createConnectedReadModelSource(
  options: ConnectedReadModelOptions,
): PortfolioReadModelSource {
  const now = options.now ?? (() => new Date());

  async function readOperationalProbe(): Promise<ConnectedHealthProbeResult> {
    if (!options.healthProbe) {
      return { providerVerified: false, workerHeartbeatAt: null };
    }
    try {
      return await options.healthProbe();
    } catch {
      return { providerVerified: false, workerHeartbeatAt: null };
    }
  }

  async function ownerId(): Promise<string> {
    const result = await options.database.query<OwnerRow>(
      'select id from users where lower(email) = lower($1) limit 1',
      [options.ownerEmail],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new ReadModelSourceError('source_unavailable', 503);
    return id;
  }

  async function currentSnapshot(userId: string): Promise<SnapshotRow> {
    const result = await options.database.query<SnapshotRow>(
      `select id, sync_run_id, total_value, as_of, coverage, freshness,
              reconciliation_status, calculation_version, payload
       from portfolio_snapshots
       where user_id = $1 and is_current = true
       order by promoted_at desc
       limit 1`,
      [userId],
    );
    const snapshot = result.rows[0];
    if (!snapshot) throw new ReadModelSourceError('source_unavailable', 503);
    return snapshot;
  }

  async function accountRows(snapshotId: string): Promise<AccountRow[]> {
    const result = await options.database.query<AccountRow>(
      `select account.id, account.display_name, account.masked_account_number,
              account.status, detail.provider_total, detail.modeled_total,
              detail.residual, detail.tolerance, detail.cash_value,
              detail.unsupported_detail_value, detail.inclusion_reason,
              detail.quality
       from portfolio_snapshot_accounts link
       join account_snapshots detail on detail.id = link.account_snapshot_id
       join accounts account on account.id = detail.account_id
       where link.portfolio_snapshot_id = $1 and detail.included = true
       order by detail.provider_total desc, account.display_name asc`,
      [snapshotId],
    );
    return result.rows;
  }

  async function positionRows(syncRunId: string, userId: string): Promise<PositionRow[]> {
    const result = await options.database.query<PositionRow>(
      `select security.id as instrument_id, position.account_id,
              account.display_name as account_name, security.symbol,
              security.name, security.asset_class, security.supported,
              position.quantity, position.provider_market_value as market_value,
              position.cost_basis,
              quote.quality as quote_quality
       from position_observations position
       join accounts account on account.id = position.account_id
       join securities security on security.id = position.security_id
       left join quote_observations quote
         on quote.sync_run_id = position.sync_run_id
        and quote.security_id = position.security_id
       where position.sync_run_id = $1 and account.user_id = $2
       order by security.symbol asc, account.display_name asc`,
      [syncRunId, userId],
    );
    return result.rows;
  }

  async function optionRows(syncRunId: string, userId: string): Promise<OptionRow[]> {
    const result = await options.database.query<OptionRow>(
      `select option_position.account_id,
              account.display_name as account_name,
              option_position.quantity,
              option_position.provider_market_value as market_value
       from option_observations option_position
       join accounts account on account.id = option_position.account_id
       where option_position.sync_run_id = $1 and account.user_id = $2`,
      [syncRunId, userId],
    );
    return result.rows;
  }

  function buildHoldings(
    positions: readonly PositionRow[],
    optionsRows: readonly OptionRow[],
    portfolioTotal: Decimal,
  ): HoldingReadModel[] {
    const grouped = new Map<string, PositionRow[]>();
    for (const row of positions) {
      const rows = grouped.get(row.instrument_id) ?? [];
      rows.push(row);
      grouped.set(row.instrument_id, rows);
    }

    const result = [...grouped.entries()].map(([instrumentId, rows]) => {
      const first = rows[0]!;
      const marketValue = rows.reduce(
        (sum, row) => sum.plus(decimal(row.market_value)),
        new Decimal(0),
      );
      const quantity = rows.reduce(
        (sum, row) => sum.plus(decimal(row.quantity)),
        new Decimal(0),
      );
      const allCostBasisKnown = rows.every((row) => row.cost_basis !== null);
      const costBasis = allCostBasisKnown
        ? rows.reduce(
            (sum, row) => sum.plus(decimal(row.cost_basis)),
            new Decimal(0),
          )
        : null;
      const pnl = costBasis ? marketValue.minus(costBasis) : null;
      const quoteStates = rows.map((row) => row.quote_quality);
      const quoteStatus = quoteStates.some(
        (state) => state === 'complete' || state === 'fresh',
      )
        ? ('fresh' as const)
        : quoteStates.some((state) => state === 'stale')
          ? ('stale' as const)
          : ('unavailable' as const);
      return {
        instrumentId,
        symbol: first.symbol,
        name: first.name,
        assetClass: first.asset_class,
        quantity: decimalString(quantity),
        marketValue: usd(marketValue.toFixed()),
        allocation: safeRatio(marketValue, portfolioTotal) ?? ratio('0'),
        dailyChange: null,
        dailyChangeRatio: null,
        costBasis: costBasis ? usd(costBasis.toFixed()) : null,
        unrealizedPnl: pnl ? usd(pnl.toFixed()) : null,
        unrealizedPnlRatio: pnl && costBasis ? safeRatio(pnl, costBasis) : null,
        accounts: rows.map((row) => ({
          accountId: row.account_id,
          displayName: row.account_name,
          value: usd(decimal(row.market_value).toFixed()),
          allocation:
            safeRatio(decimal(row.market_value), portfolioTotal) ?? ratio('0'),
        })),
        quoteStatus,
        support: first.supported
          ? ('supported' as const)
          : ('unsupported_detail' as const),
      } satisfies HoldingReadModel;
    });

    if (optionsRows.length > 0) {
      const optionValue = optionsRows.reduce(
        (sum, row) => sum.plus(decimal(row.market_value)),
        new Decimal(0),
      );
      const optionQuantity = optionsRows.reduce(
        (sum, row) => sum.plus(decimal(row.quantity).abs()),
        new Decimal(0),
      );
      const perAccount = new Map<string, { name: string; value: Decimal }>();
      for (const row of optionsRows) {
        const previous = perAccount.get(row.account_id)?.value ?? new Decimal(0);
        perAccount.set(row.account_id, {
          name: row.account_name,
          value: previous.plus(decimal(row.market_value)),
        });
      }
      result.push({
        instrumentId: 'unsupported-options',
        symbol: 'OPTIONS',
        name: 'Options (detail unavailable)',
        assetClass: 'option',
        quantity: decimalString(optionQuantity),
        marketValue: usd(optionValue.toFixed()),
        allocation: safeRatio(optionValue, portfolioTotal) ?? ratio('0'),
        dailyChange: null,
        dailyChangeRatio: null,
        costBasis: null,
        unrealizedPnl: null,
        unrealizedPnlRatio: null,
        accounts: [...perAccount.entries()].map(([accountId, entry]) => ({
          accountId,
          displayName: entry.name,
          value: usd(entry.value.toFixed()),
          allocation: safeRatio(entry.value, portfolioTotal) ?? ratio('0'),
        })),
        quoteStatus: 'unavailable',
        support: 'unsupported_detail',
      });
    }

    return result.sort((left, right) =>
      decimal(right.marketValue.amount).comparedTo(left.marketValue.amount),
    );
  }

  async function latestSyncFailed(userId: string): Promise<boolean> {
    const result = await options.database.query<{ status: string }>(
      `select status from sync_runs
       where user_id = $1
       order by started_at desc, id desc
       limit 1`,
      [userId],
    );
    return result.rows[0]?.status === 'failed';
  }

  async function load(): Promise<ConnectedContext> {
    const userId = await ownerId();
    const snapshot = await currentSnapshot(userId);
    const [accounts, positions, optionPositions, failed] = await Promise.all([
      accountRows(snapshot.id),
      positionRows(snapshot.sync_run_id, userId),
      optionRows(snapshot.sync_run_id, userId),
      latestSyncFailed(userId),
    ]);
    const reasons: string[] = [];
    if (failed) reasons.push('latest_sync_failed');
    const mappedCoverage = coverage(snapshot.coverage);
    if (mappedCoverage === 'partial_known_unsupported') {
      reasons.push('known_unsupported_position_detail');
    }
    const currentFreshness = freshnessAtRead(
      snapshot.freshness,
      snapshot.as_of,
      now(),
    );
    if (currentFreshness === 'stale') reasons.push('source_stale');
    if (currentFreshness === 'unknown') reasons.push('source_freshness_unknown');
    const quality: DataQualityReadModel = {
      coverage: mappedCoverage,
      freshness: currentFreshness,
      reconciliation:
        snapshot.reconciliation_status === 'reconciled'
          ? 'reconciled'
          : 'unavailable',
      reasons,
    };
    return {
      ownerId: userId,
      snapshot,
      payload: parsedPayload(snapshot.payload),
      accounts,
      positions,
      optionPositions,
      holdings: buildHoldings(
        positions,
        optionPositions,
        decimal(snapshot.total_value),
      ),
      quality,
      latestSyncFailed: failed,
    };
  }

  function accountSummaries(context: ConnectedContext): AccountSummaryReadModel[] {
    const portfolioTotal = decimal(context.snapshot.total_value);
    return context.accounts.map((account) => {
      const value = decimal(account.provider_total);
      return {
        id: account.id,
        displayName: account.display_name,
        maskedAccountNumber: publicMaskedAccountNumber(
          account.masked_account_number,
        ),
        status: account.status === 'closed' ? 'closed' : 'active',
        value: usd(value.toFixed()),
        cash: usd(decimal(account.cash_value).toFixed()),
        dailyChange: null,
        dailyChangeRatio: null,
        allocation: safeRatio(value, portfolioTotal) ?? ratio('0'),
        holdingsCount: context.holdings.filter((holding) =>
          holding.accounts.some((entry) => entry.accountId === account.id),
        ).length,
        coverage: coverage(account.quality),
      };
    });
  }

  async function history(
    userId: string,
    range: PerformanceRange,
    endAt: string,
  ): Promise<TrendPointReadModel[]> {
    const start = rangeStart(range, new Date(endAt));
    const result = await options.database.query<HistoryRow>(
      `select total_value, as_of
       from portfolio_snapshots
       where user_id = $1 and ($2::timestamptz is null or as_of >= $2::timestamptz)
       order by as_of asc, promoted_at asc`,
      [userId, start?.toISOString() ?? null],
    );
    let previous: Decimal | null = null;
    return result.rows.map((row) => {
      const at = iso(row.as_of);
      const value = decimal(row.total_value);
      const change = previous === null ? null : usd(value.minus(previous).toFixed());
      previous = value;
      return { at, label: dateLabel(at), value: usd(value.toFixed()), change };
    });
  }

  async function performance(
    context: ConnectedContext,
    range: PerformanceRange,
  ): Promise<PerformanceReadModel> {
    const points = await history(
      context.ownerId,
      range,
      iso(context.snapshot.as_of),
    );
    const startValue = points[0]?.value ?? null;
    const endValue = points.at(-1)?.value ?? null;
    const change =
      startValue && endValue
        ? usd(decimal(endValue.amount).minus(startValue.amount).toFixed())
        : null;
    const start = rangeStart(range, new Date(context.snapshot.as_of));
    const flows = await options.database.query<{
      amount: string | number;
      effective_at: string | Date;
      description: string;
    }>(
      `select amount, effective_at, description
       from transactions
       where user_id = $1
         and kind in ('deposit', 'withdrawal')
         and ($2::timestamptz is null or effective_at >= $2::timestamptz)
       order by effective_at asc`,
      [context.ownerId, start?.toISOString() ?? null],
    );
    return {
      mode: 'connected',
      range,
      seriesLabel: 'portfolio_value_change',
      trend: points,
      startValue,
      endValue,
      change,
      changeRatio:
        change && startValue ? safeRatio(change.amount, startValue.amount) : null,
      externalFlows: flows.rows.map((flow) => ({
        at: iso(flow.effective_at),
        label: flow.description,
        value: usd(decimal(flow.amount).toFixed()),
      })),
      asOf: iso(context.snapshot.as_of),
      quality: context.quality,
    };
  }

  async function dailyChange(context: ConnectedContext) {
    const currentAsOf = new Date(context.snapshot.as_of);
    const currentSession = resolveUsEquitySession(currentAsOf);
    const priorCloseAt = currentSession.scheduleWindow.openAt
      ? resolveUsEquitySession(
          new Date(
            new Date(currentSession.scheduleWindow.openAt).getTime() - 1_000,
          ),
        ).lastRegularCloseAt
      : currentSession.lastRegularCloseAt;
    const boundary = new Date(priorCloseAt);
    const boundaryStart = boundary;
    const boundaryEnd = new Date(boundary.getTime() + 30 * 60 * 1_000);
    const prior = await options.database.query<DailyBoundaryRow>(
      `select total_value, as_of, coverage, reconciliation_status
       from portfolio_snapshots
       where user_id = $1
         and calculation_version = $2
         and as_of >= $3::timestamptz
         and as_of <= $4::timestamptz
       order by as_of asc, promoted_at desc
       limit 1`,
      [
        context.ownerId,
        context.snapshot.calculation_version,
        boundaryStart.toISOString(),
        boundaryEnd.toISOString(),
      ],
    );
    const priorSnapshot = prior.rows[0] ?? null;
    const activities = priorSnapshot
      ? await options.database.query<DailyActivityRow>(
          `select kind, amount, effective_at, import_batch_id, provenance
           from transactions
           where user_id = $1
             and effective_at > $2::timestamptz
             and effective_at <= $3::timestamptz
           order by effective_at asc, id asc`,
          [
            context.ownerId,
            iso(priorSnapshot.as_of),
            iso(context.snapshot.as_of),
          ],
        )
      : { rows: [] };

    return calculateDailyChange({
      currentValue: usd(decimal(context.snapshot.total_value).toFixed()),
      currentAsOf: iso(context.snapshot.as_of),
      priorCloseValue: priorSnapshot
        ? usd(decimal(priorSnapshot.total_value).toFixed())
        : null,
      priorCloseAsOf: priorSnapshot ? iso(priorSnapshot.as_of) : null,
      snapshotsEligible:
        context.snapshot.coverage === 'complete' &&
        context.snapshot.reconciliation_status === 'reconciled' &&
        priorSnapshot?.coverage === 'complete' &&
        priorSnapshot.reconciliation_status === 'reconciled',
      // The current Robinhood read allowlist does not include a transaction
      // history endpoint, and imported statements do not yet persist a
      // complete-period coverage assertion. Never infer daily investment
      // movement from an incomplete external-flow window.
      flowCoverageComplete: false,
      activities: activities.rows.map((activity) => {
        const provenance = parsedPayload(activity.provenance);
        return {
          kind: transactionKind(activity.kind),
          amount: usd(decimal(activity.amount).toFixed()),
          effectiveAt: iso(activity.effective_at),
          timestampPrecision:
            provenance.timestampPrecision === 'instant' ||
            activity.import_batch_id === null
              ? 'instant'
              : 'date',
        };
      }),
    });
  }

  return {
    async getDashboard(): Promise<DashboardReadModel> {
      const context = await load();
      const summaries = accountSummaries(context);
      const portfolioTotal = decimal(context.snapshot.total_value);
      const cash = context.accounts.reduce(
        (sum, account) => sum.plus(decimal(account.cash_value)),
        new Decimal(0),
      );
      const trend = await history(context.ownerId, '1M', iso(context.snapshot.as_of));
      const change = await dailyChange(context);
      const operationalProbe = await readOperationalProbe();
      const operationalHealth = evaluateConnectedHealth({
        databaseReady: true,
        providerVerified: operationalProbe.providerVerified,
        workerHeartbeatAt: operationalProbe.workerHeartbeatAt,
        lastSuccessfulRefreshAt: null,
        now: now(),
      });
      const dashboardQuality =
        change.state === 'unavailable' && change.reason
          ? {
              ...context.quality,
              reasons: [...new Set([...context.quality.reasons, change.reason])],
            }
          : context.quality;
      const currentSourceUsable =
        !context.latestSyncFailed &&
        context.quality.freshness === 'fresh' &&
        operationalHealth.status === 'ok';
      return {
        mode: 'connected',
        connectionState: context.latestSyncFailed
          ? 'source_error'
          : currentSourceUsable
            ? 'live'
            : 'disconnected',
        sourceLabel: context.latestSyncFailed
          ? 'Robinhood read-only — showing last good snapshot'
          : currentSourceUsable
            ? 'Robinhood read-only'
            : operationalHealth.status !== 'ok'
              ? 'Robinhood read-only — connection health is degraded'
              : 'Robinhood read-only — snapshot is not current',
        portfolioValue: usd(portfolioTotal.toFixed()),
        dailyChange: change.amount,
        dailyChangeRatio: change.ratio,
        accounts: summaries,
        trend,
        allocation: buildAllocation(context.holdings, cash, portfolioTotal),
        topHoldings: context.holdings.slice(0, 5),
        insight: context.latestSyncFailed
          ? {
              title: 'Latest sync failed',
              body: 'Values remain available from the last validated snapshot.',
              severity: 'watch',
            }
          : null,
        quality: dashboardQuality,
        capabilities: {
          liveBrokerage: currentSourceUsable,
          manualRefresh: true,
          imports: false,
          alerts: true,
          readOnly: true,
        },
        asOf: iso(context.snapshot.as_of),
        generatedAt: now().toISOString(),
        calculationVersion: context.snapshot.calculation_version,
      };
    },

    async listAccounts() {
      const context = await load();
      return {
        mode: 'connected',
        accounts: accountSummaries(context),
        portfolioValue: usd(decimal(context.snapshot.total_value).toFixed()),
        asOf: iso(context.snapshot.as_of),
        quality: context.quality,
      };
    },

    async getAccount(accountId): Promise<AccountDetailReadModel | null> {
      const context = await load();
      const account = accountSummaries(context).find(
        (candidate) => candidate.id === accountId,
      );
      const sourceAccount = context.accounts.find(
        (candidate) => candidate.id === accountId,
      );
      if (!account || !sourceAccount) return null;
      const scopedHoldings = context.holdings
        .filter((holding) =>
          holding.accounts.some((entry) => entry.accountId === accountId),
        )
        .map((holding) => {
          const scopedAccounts = holding.accounts.filter(
            (entry) => entry.accountId === accountId,
          );
          const scopedValue = scopedAccounts.reduce(
            (sum, entry) => sum.plus(entry.value.amount),
            new Decimal(0),
          );
          const scopedPositions = context.positions.filter(
            (position) =>
              position.account_id === accountId &&
              position.instrument_id === holding.instrumentId,
          );
          const scopedOptions =
            holding.instrumentId === 'unsupported-options'
              ? context.optionPositions.filter(
                  (option) => option.account_id === accountId,
                )
              : [];
          const scopedQuantity = [...scopedPositions, ...scopedOptions].reduce(
            (sum, position) => sum.plus(decimal(position.quantity)),
            new Decimal(0),
          );
          const costBasisKnown =
            scopedPositions.length > 0 &&
            scopedOptions.length === 0 &&
            scopedPositions.every((position) => position.cost_basis !== null);
          const scopedCostBasis = costBasisKnown
            ? scopedPositions.reduce(
                (sum, position) => sum.plus(decimal(position.cost_basis)),
                new Decimal(0),
              )
            : null;
          const scopedPnl = scopedCostBasis
            ? scopedValue.minus(scopedCostBasis)
            : null;
          return {
            ...holding,
            quantity: decimalString(scopedQuantity),
            marketValue: usd(scopedValue.toFixed()),
            allocation:
              safeRatio(scopedValue, sourceAccount.provider_total ?? 0) ?? ratio('0'),
            costBasis: scopedCostBasis ? usd(scopedCostBasis.toFixed()) : null,
            unrealizedPnl: scopedPnl ? usd(scopedPnl.toFixed()) : null,
            unrealizedPnlRatio:
              scopedPnl && scopedCostBasis
                ? safeRatio(scopedPnl, scopedCostBasis)
                : null,
            accounts: scopedAccounts.map((entry) => ({
              ...entry,
              allocation:
                safeRatio(entry.value.amount, sourceAccount.provider_total ?? 0) ??
                ratio('0'),
            })),
          };
        });
      return {
        mode: 'connected',
        account,
        holdings: scopedHoldings,
        allocation: buildAllocation(
          scopedHoldings,
          decimal(sourceAccount.cash_value),
          decimal(sourceAccount.provider_total),
        ),
        asOf: iso(context.snapshot.as_of),
        quality: context.quality,
      };
    },

    async listHoldings() {
      const context = await load();
      const total = context.holdings.reduce(
        (sum, holding) => sum.plus(holding.marketValue.amount),
        new Decimal(0),
      );
      return {
        mode: 'connected',
        holdings: context.holdings,
        totalValue: usd(total.toFixed()),
        asOf: iso(context.snapshot.as_of),
        quality: context.quality,
      };
    },

    async getHolding(instrumentId): Promise<HoldingDetailReadModel | null> {
      const context = await load();
      const holding = context.holdings.find(
        (candidate) => candidate.instrumentId === instrumentId,
      );
      return holding
        ? {
            mode: 'connected',
            holding,
            asOf: iso(context.snapshot.as_of),
            quality: context.quality,
          }
        : null;
    },

    async getPerformance(range) {
      return performance(await load(), range);
    },

    async getAnalytics(): Promise<AnalyticsReadModel> {
      const context = await load();
      const portfolioTotal = decimal(context.snapshot.total_value);
      const cash = context.accounts.reduce(
        (sum, account) => sum.plus(decimal(account.cash_value)),
        new Decimal(0),
      );
      const unsupported = context.holdings
        .filter((holding) => holding.support === 'unsupported_detail')
        .reduce(
          (sum, holding) => sum.plus(holding.marketValue.amount),
          new Decimal(0),
        );
      const supported = context.holdings
        .filter((holding) => holding.support === 'supported')
        .reduce(
          (sum, holding) => sum.plus(holding.marketValue.amount),
          cash,
        );
      const topTwo = context.holdings
        .slice(0, 2)
        .reduce((sum, holding) => sum.plus(holding.marketValue.amount), new Decimal(0));
      return {
        mode: 'connected',
        allocation: buildAllocation(context.holdings, cash, portfolioTotal),
        largestHolding: context.holdings[0] ?? null,
        topTwoWeight: safeRatio(topTwo, portfolioTotal),
        supportedAssetsWeight: safeRatio(supported, portfolioTotal),
        unsupportedDetailValue: usd(unsupported.toFixed()),
        quality: context.quality,
      };
    },

    async getActivity(): Promise<ActivityReadModel> {
      const context = await load();
      const [transactions, syncs] = await Promise.all([
        options.database.query<TransactionRow>(
          `select id, account_id, kind, amount, effective_at, description,
                  (import_batch_id is not null) as imported
           from transactions
           where user_id = $1
           order by effective_at desc
           limit 100`,
          [context.ownerId],
        ),
        options.database.query<SyncActivityRow>(
          `select id, status, trigger, started_at, completed_at
           from sync_runs
           where user_id = $1
           order by started_at desc
           limit 25`,
          [context.ownerId],
        ),
      ]);
      const items: ActivityItemReadModel[] = [
        ...transactions.rows.map((transaction) => ({
          id: transaction.id,
          at: iso(transaction.effective_at),
          kind: publicTransactionKind(transaction.kind),
          title: transaction.description,
          description: 'Recorded portfolio activity.',
          amount: usd(decimal(transaction.amount).toFixed()),
          accountId: transaction.account_id,
          source: transaction.imported ? ('imported' as const) : ('robinhood' as const),
        })),
        ...syncs.rows.map((sync) => ({
          id: sync.id,
          at: iso(sync.completed_at ?? sync.started_at),
          kind: 'sync' as const,
          title: sync.status === 'succeeded' ? 'Portfolio synced' : 'Portfolio sync update',
          description:
            sync.status === 'failed'
              ? 'The latest attempt failed; last-good values were preserved.'
              : `Read-only ${sync.trigger} refresh ${sync.status}.`,
          amount: null,
          accountId: null,
          source: 'robinhood' as const,
        })),
      ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
      return {
        mode: 'connected',
        items,
        asOf: iso(context.snapshot.as_of),
        quality: context.quality,
      };
    },

    async getReconciliation(): Promise<ReconciliationReadModel> {
      const context = await load();
      return {
        mode: 'connected',
        accounts: context.accounts.map((account) => ({
          accountId: account.id,
          displayName: account.display_name,
          providerTotal: usd(decimal(account.provider_total).toFixed()),
          modeledTotal: usd(decimal(account.modeled_total).toFixed()),
          residual: usd(decimal(account.residual).toFixed()),
          tolerance: usd(decimal(account.tolerance).toFixed()),
          state:
            account.quality === 'complete'
              ? ('reconciled' as const)
              : ('partial' as const),
          inclusionReason: account.inclusion_reason,
        })),
        asOf: iso(context.snapshot.as_of),
      };
    },

    async getAlerts(): Promise<AlertsReadModel> {
      const context = await load();
      const [alerts, ruleCount] = await Promise.all([
        options.database.query<AlertRow>(
          `select event.id, event.snapshot_id, event.evidence, rule.kind,
                  rule.muted_until, event.state, event.read_at, event.created_at
           from alert_events event
           join alert_rules rule on rule.id = event.rule_id
           where rule.user_id = $1
             and event.state = 'breach_confirmed'
           order by event.created_at desc
           limit 100`,
          [context.ownerId],
        ),
        options.database.query<{ count: string | number }>(
          'select count(*) as count from alert_rules where user_id = $1 and enabled = true',
          [context.ownerId],
        ),
      ]);
      return {
        mode: 'connected',
        alerts: alerts.rows.map((alert) => {
          const evidence = parsedPayload(alert.evidence);
          return {
            id: alert.id,
            ...alertCopy(alert.kind),
            state: alert.read_at === null && alert.state !== 'read' ? 'new' as const : 'read' as const,
            createdAt: iso(alert.created_at),
            mutedUntil:
              alert.muted_until && new Date(alert.muted_until).getTime() > now().getTime()
                ? iso(alert.muted_until)
                : null,
            evidence: {
              snapshotId: alert.snapshot_id,
              baselineObservationId:
                typeof evidence.baselineObservationId === 'string'
                  ? evidence.baselineObservationId
                  : null,
              sourceAsOf:
                typeof evidence.sourceAsOf === 'string' ? evidence.sourceAsOf : null,
              observedMoney: publicMoney(evidence.observedMoney),
              observedRatio: publicRatio(evidence.observedRatio),
              thresholdMoney: publicMoney(evidence.thresholdMoney),
              thresholdRatio: publicRatio(evidence.thresholdRatio),
              flowAdjustment: publicMoney(evidence.flowAdjustment),
              quality: publicAlertQuality(evidence.quality),
              calculationVersion:
                typeof evidence.calculationVersion === 'string'
                  ? evidence.calculationVersion
                  : null,
              scope: publicAlertScope(evidence.scope),
              decisionReason:
                typeof evidence.decisionReason === 'string'
                  ? evidence.decisionReason.slice(0, 240)
                  : null,
            },
          };
        }),
        rulesEnabled: Number(ruleCount.rows[0]?.count ?? 0) > 0,
        asOf: iso(context.snapshot.as_of),
      };
    },

    async requestRefresh() {
      const userId = await ownerId();
      const key = `refresh:${userId}`;
      const existing = await options.database.query<{ status: string }>(
        `select status from jobs
         where dedupe_key = $1 and status in ('queued', 'running')
         limit 1`,
        [key],
      );
      const job = await options.jobs.enqueueUnique({
        userId,
        kind: 'portfolio_refresh',
        key,
        payload: { trigger: 'manual' },
      });
      return {
        state: existing.rows.length > 0 ? ('coalesced' as const) : ('queued' as const),
        jobId: job.id,
        mode: 'connected' as const,
      };
    },

    async getHealth() {
      let databaseReady = false;
      try {
        await options.database.query('select 1');
        databaseReady = true;
      } catch {
        databaseReady = false;
      }
      let lastSuccessfulRefreshAt: string | null = null;
      if (databaseReady) {
        try {
          const owner = await ownerId();
          const successful = await options.database.query<{
            completed_at: string | Date | null;
          }>(
            `select max(completed_at) as completed_at
             from sync_runs
             where user_id = $1 and status = 'succeeded'`,
            [owner],
          );
          const completedAt = successful.rows[0]?.completed_at ?? null;
          lastSuccessfulRefreshAt = completedAt ? iso(completedAt) : null;
        } catch {
          databaseReady = false;
        }
      }
      const probe = databaseReady
        ? await readOperationalProbe()
        : { providerVerified: false, workerHeartbeatAt: null };
      return evaluateConnectedHealth({
        databaseReady,
        providerVerified: probe.providerVerified,
        workerHeartbeatAt: probe.workerHeartbeatAt,
        lastSuccessfulRefreshAt,
        now: now(),
      });
    },
  };
}
