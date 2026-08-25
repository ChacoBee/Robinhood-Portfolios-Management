import { randomUUID } from 'node:crypto';
import { normalizeDecimal } from '@aurum/domain';
import type { DatabaseClient } from './client';
import { createJobRepository, type JobRepository } from './jobs';
import type { AccountPromotionDetail } from '../sync/snapshot-promotion';
import type { SafeRefreshFailureCode } from '../sync/failure-codes';
import type {
  AccountReferenceVault,
  ProviderIdentifierKind,
  StableProviderKey,
} from '../robinhood/vault';

export interface CreateOwnerInput {
  id: string;
  email: string;
}

export interface PromotePortfolioSnapshotInput {
  id: string;
  userId: string;
  syncRunId: string;
  totalValue: string;
  asOf: string;
  coverage: string;
  freshness: string;
  reconciliationStatus: string;
  calculationVersion: string;
  payload: Record<string, unknown>;
  receivedAt?: string;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  sourceFingerprint?: string;
  syncCompleteness?: string;
  mappingVersion?: string;
  accounts?: readonly AccountPromotionDetail[];
  leaseGuard?: { jobId: string; workerId: string };
  auditEvent?: {
    actor: string;
    action: string;
    scope: string;
    metadata: Record<string, unknown>;
  };
}

export interface SnapshotPromotionResult {
  snapshotId: string;
  promoted: boolean;
}

export class SnapshotPersistenceError extends Error {
  constructor(readonly code: 'job_lease_lost' | 'stale_snapshot_candidate') {
    super(code);
    this.name = 'SnapshotPersistenceError';
  }
}

export interface PortfolioSnapshotRecord {
  id: string;
  userId: string;
  syncRunId: string;
  totalValue: string;
  currency: 'USD';
  asOf: string;
  coverage: string;
  freshness: string;
  reconciliationStatus: string;
  calculationVersion: string;
  syncCompleteness: string;
  sourceWindowStart: string | null;
  sourceWindowEnd: string | null;
  sourceFingerprint: string | null;
  payload: Record<string, unknown>;
  promotedAt: string;
}

export interface OwnerRefreshState {
  userId: string;
  lastSuccessfulRefreshAt: string | null;
  currentSnapshotAsOf: string | null;
}

export interface PortfolioRepository {
  createOwner(input: CreateOwnerInput): Promise<void>;
  startSyncRun(input: {
    id: string;
    userId: string;
    trigger: string;
  }): Promise<void>;
  promoteSnapshot(
    input: PromotePortfolioSnapshotInput,
  ): Promise<SnapshotPromotionResult>;
  getCurrent(userId: string): Promise<PortfolioSnapshotRecord | null>;
  countSnapshots(userId: string): Promise<number>;
  recordFailedRun(
    userId: string,
    reason: SafeRefreshFailureCode,
    syncRunId?: string,
  ): Promise<string>;
  getExpectedAccountKeys(userId: string): Promise<readonly string[]>;
  listOwnerRefreshStates(): Promise<readonly OwnerRefreshState[]>;
}

export interface ImportRepository {
  createBatch(input: {
    id: string;
    userId: string;
    sourceType: string;
    fileSha256: string;
    originalFilename: string;
    parserVersion: string;
    mappingVersion: string;
  }): Promise<void>;
}

export interface AlertRepository {
  appendEvent(input: {
    id: string;
    ruleId: string;
    fingerprint: string;
    state: string;
    evidence: Record<string, unknown>;
  }): Promise<void>;
}

export interface AuditRepository {
  append(input: {
    id?: string;
    userId: string | null;
    actor: string;
    action: string;
    scope: string;
    metadata?: Record<string, unknown>;
    requestId?: string;
  }): Promise<string>;
}

interface SnapshotRow {
  id: string;
  user_id: string;
  sync_run_id: string;
  total_value: string | number;
  currency: 'USD';
  as_of: string | Date;
  coverage: string;
  freshness: string;
  reconciliation_status: string;
  calculation_version: string;
  sync_completeness: string;
  source_window_start: string | Date | null;
  source_window_end: string | Date | null;
  source_fingerprint: string | null;
  payload: Record<string, unknown> | string;
  promoted_at: string | Date;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface RepositorySecurityOptions {
  providerIdentifierKeyer?: Pick<AccountReferenceVault, 'stableProviderKey'>;
}

function providerRecordKey(
  security: RepositorySecurityOptions,
  kind: ProviderIdentifierKind,
  value: string,
): StableProviderKey {
  if (!security.providerIdentifierKeyer) {
    throw new Error('provider_identifier_keyer_required');
  }
  return security.providerIdentifierKeyer.stableProviderKey(kind, value);
}

function mapSnapshot(row: SnapshotRow): PortfolioSnapshotRecord {
  return {
    id: row.id,
    userId: row.user_id,
    syncRunId: row.sync_run_id,
    totalValue: normalizeDecimal(String(row.total_value)),
    currency: row.currency,
    asOf: toIso(row.as_of),
    coverage: row.coverage,
    freshness: row.freshness,
    reconciliationStatus: row.reconciliation_status,
    calculationVersion: row.calculation_version,
    syncCompleteness: row.sync_completeness,
    sourceWindowStart:
      row.source_window_start === null ? null : toIso(row.source_window_start),
    sourceWindowEnd:
      row.source_window_end === null ? null : toIso(row.source_window_end),
    sourceFingerprint: row.source_fingerprint,
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : row.payload,
    promotedAt: toIso(row.promoted_at),
  };
}

function createPortfolioRepository(
  database: DatabaseClient,
  security: RepositorySecurityOptions,
): PortfolioRepository {
  return {
    async createOwner(input) {
      await database.query(
        `insert into users (id, email)
         values ($1, lower($2))
         on conflict (id) do update set email = excluded.email`,
        [input.id, input.email],
      );
    },

    async startSyncRun(input) {
      await database.query(
        `insert into sync_runs (
           id, user_id, trigger, status, sync_completeness, metadata
         ) values ($1, $2, $3, 'running', 'partial_source', '{}'::jsonb)`,
        [input.id, input.userId, input.trigger],
      );
    },

    async promoteSnapshot(input) {
      return database.transaction(async (transaction) => {
        if (input.leaseGuard) {
          const lease = await transaction.query<{ id: string }>(
            `select id
             from jobs
             where id = $1
               and status = 'running'
               and lease_owner = $2
               and lease_expires_at > now()
             for update`,
            [input.leaseGuard.jobId, input.leaseGuard.workerId],
          );
          if (lease.rows.length !== 1) {
            throw new SnapshotPersistenceError('job_lease_lost');
          }
        }

        const sourceFingerprint = input.sourceFingerprint ?? input.syncRunId;
        const sourceWindowStart = input.sourceWindowStart ?? input.asOf;
        const sourceWindowEnd = input.sourceWindowEnd ?? input.asOf;
        const observedAt = input.receivedAt ?? new Date().toISOString();
        await transaction.query(
          `insert into sync_runs (
             id, user_id, trigger, status, completed_at, source_as_of,
             sync_completeness, source_window_start, source_window_end,
             source_fingerprint, mapping_version, calculation_version, metadata
           ) values (
             $1, $2, 'snapshot_promotion', 'succeeded', now(), $3,
             $4, $5, $6, $7, $8, $9, $10::jsonb
           )
           on conflict (id) do update set
             status = 'succeeded',
             completed_at = now(),
             source_as_of = excluded.source_as_of,
             sync_completeness = excluded.sync_completeness,
             source_window_start = excluded.source_window_start,
             source_window_end = excluded.source_window_end,
             source_fingerprint = excluded.source_fingerprint,
             mapping_version = excluded.mapping_version,
             calculation_version = excluded.calculation_version,
             metadata = sync_runs.metadata || excluded.metadata`,
          [
            input.syncRunId,
            input.userId,
            input.asOf,
            input.syncCompleteness ?? 'complete',
            sourceWindowStart,
            sourceWindowEnd,
            sourceFingerprint,
            input.mappingVersion ?? 'unknown',
            input.calculationVersion,
            JSON.stringify({ source: input.payload.source ?? 'unknown' }),
          ],
        );

        const duplicate = await transaction.query<{ id: string }>(
          `select id
           from portfolio_snapshots
           where user_id = $1
             and source_fingerprint = $2
             and calculation_version = $3
           limit 1`,
          [input.userId, sourceFingerprint, input.calculationVersion],
        );
        if (duplicate.rows[0]) {
          if (input.leaseGuard) {
            await transaction.query(
              `update jobs
               set status = 'completed', completed_at = now(), lease_owner = null,
                   lease_expires_at = null, updated_at = now()
               where id = $1 and status = 'running' and lease_owner = $2`,
              [input.leaseGuard.jobId, input.leaseGuard.workerId],
            );
          }
          if (input.auditEvent) {
            await transaction.query(
              `insert into audit_events (
                 id, user_id, actor, action, scope, metadata
               ) values ($1, $2, $3, $4, $5, $6::jsonb)`,
              [
                randomUUID(),
                input.userId,
                input.auditEvent.actor,
                'portfolio_snapshot_unchanged',
                duplicate.rows[0].id,
                JSON.stringify({ ...input.auditEvent.metadata, deduplicated: true }),
              ],
            );
          }
          return { snapshotId: duplicate.rows[0].id, promoted: false };
        }

        const current = await transaction.query<{ as_of: string | Date }>(
          `select as_of
           from portfolio_snapshots
           where user_id = $1 and is_current = true
           for update`,
          [input.userId],
        );
        if (
          current.rows[0] &&
          new Date(current.rows[0].as_of).getTime() > new Date(input.asOf).getTime()
        ) {
          throw new SnapshotPersistenceError('stale_snapshot_candidate');
        }

        const accountSnapshotIds: string[] = [];
        const securityIds = new Map<string, string>();
        const insertedQuotes = new Set<string>();
        for (const account of input.accounts ?? []) {
          const accountId = randomUUID();
          const accountResult = await transaction.query<{ id: string }>(
            `insert into accounts (
               id, user_id, provider, provider_account_key, display_name,
               masked_account_number, status, total_kind
             ) values ($1, $2, 'robinhood', $3, $4, $5, $6, $7)
             on conflict (user_id, provider, provider_account_key) do update set
               display_name = excluded.display_name,
               masked_account_number = excluded.masked_account_number,
               status = excluded.status,
               total_kind = excluded.total_kind
             returning id`,
            [
              accountId,
              input.userId,
              account.stableKey,
              account.displayName,
              account.maskedAccountNumber,
              account.status,
              account.totalKind,
            ],
          );
          const persistedAccountId = accountResult.rows[0]?.id;
          if (!persistedAccountId) throw new Error('account_persistence_failed');

          await transaction.query(
            `insert into cash_observations (
               id, sync_run_id, account_id, settled_cash, buying_power, accrued,
               currency, observed_at, source_as_of, quality, provenance
             ) values (
               $1, $2, $3, $4::numeric, null, $5::numeric, 'USD', $6, $7,
               'complete', $8::jsonb
             )`,
            [
              randomUUID(),
              input.syncRunId,
              persistedAccountId,
              account.cash,
              account.accrued,
              observedAt,
              account.portfolioSourceAsOf,
              JSON.stringify({
                source: 'robinhood_readonly',
                endpoint: 'portfolio',
                responseChecksum: account.portfolioChecksum,
                sourceAsOf: account.portfolioSourceAsOf,
                observedAt,
                mappingVersion: input.mappingVersion ?? 'unknown',
                syncRunId: input.syncRunId,
              }),
            ],
          );

          for (const position of account.equityPositions) {
            let securityId = securityIds.get(position.instrumentId);
            if (!securityId) {
              const proposedId = randomUUID();
              const instrumentKey = providerRecordKey(
                security,
                'instrument',
                position.instrumentId,
              );
              const persistedSecurity = await transaction.query<{ id: string }>(
                `insert into securities (
                   id, provider_instrument_ref, symbol, name, asset_class,
                   currency, supported, metadata
                 ) values ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)
                 on conflict (provider_instrument_ref) do update set
                   symbol = excluded.symbol,
                   name = excluded.name,
                   asset_class = excluded.asset_class,
                   currency = excluded.currency,
                   supported = excluded.supported
                 returning id`,
                [
                  proposedId,
                  instrumentKey,
                  position.symbol,
                  position.name,
                  position.assetClass,
                  position.currency,
                  position.detailSupport === 'supported',
                ],
              );
              securityId = persistedSecurity.rows[0]?.id;
              if (!securityId) throw new Error('security_persistence_failed');
              securityIds.set(position.instrumentId, securityId);
            }
            await transaction.query(
              `insert into position_observations (
                 id, sync_run_id, account_id, security_id, quantity,
                 provider_market_value, cost_basis, cost_basis_source, currency,
                 observed_at, source_as_of, quality, provenance
               ) values (
                 $1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8, $9,
                 $10, $11, $12, $13::jsonb
               )`,
              [
                randomUUID(),
                input.syncRunId,
                persistedAccountId,
                securityId,
                position.quantity,
                position.marketValue,
                position.costBasis,
                position.costBasisSource,
                position.currency,
                observedAt,
                position.sourceAsOf,
                position.detailSupport === 'supported'
                  ? 'complete'
                  : 'unsupported',
                JSON.stringify({
                  source: 'robinhood_readonly',
                  endpoint: 'equity_positions',
                  responseChecksum: account.equityPositionsChecksum,
                  sourceRecordKey: providerRecordKey(
                    security,
                    'instrument',
                    position.instrumentId,
                  ),
                  sourceAsOf: position.sourceAsOf,
                  observedAt,
                  mappingVersion: input.mappingVersion ?? 'unknown',
                  syncRunId: input.syncRunId,
                }),
              ],
            );
          }

          for (const option of account.optionPositions) {
            const optionKey = providerRecordKey(
              security,
              'option',
              option.optionId,
            );
            await transaction.query(
              `insert into option_observations (
                 id, sync_run_id, account_id, provider_option_key, symbol,
                 quantity, provider_market_value, currency, detail_support,
                 observed_at, source_as_of, provenance
               ) values (
                 $1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9,
                 $10, $11, $12::jsonb
               )`,
              [
                randomUUID(),
                input.syncRunId,
                persistedAccountId,
                optionKey,
                option.symbol,
                option.quantity,
                option.marketValue,
                option.currency,
                option.detailSupport,
                observedAt,
                option.sourceAsOf,
                JSON.stringify({
                  source: 'robinhood_readonly',
                  endpoint: 'option_positions',
                  responseChecksum: account.optionPositionsChecksum,
                  sourceRecordKey: optionKey,
                  sourceAsOf: option.sourceAsOf,
                  observedAt,
                  mappingVersion: input.mappingVersion ?? 'unknown',
                  syncRunId: input.syncRunId,
                }),
              ],
            );
          }

          for (const quote of account.quotes) {
            if (quote.price === null || insertedQuotes.has(quote.instrumentId)) {
              continue;
            }
            const securityId = securityIds.get(quote.instrumentId);
            if (!securityId) continue;
            insertedQuotes.add(quote.instrumentId);
            await transaction.query(
              `insert into quote_observations (
                 id, sync_run_id, security_id, price, currency, market_state,
                 observed_at, source_as_of, quality, provenance
               ) values ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9, $10::jsonb)`,
              [
                randomUUID(),
                input.syncRunId,
                securityId,
                quote.price,
                quote.currency,
                quote.marketState,
                observedAt,
                quote.sourceAsOf,
                quote.quality,
                JSON.stringify({
                  source: 'robinhood_readonly',
                  endpoint: 'equity_quotes',
                  responseChecksum: account.quotesChecksum,
                  sourceRecordKey: providerRecordKey(
                    security,
                    'instrument',
                    quote.instrumentId,
                  ),
                  sourceAsOf: quote.sourceAsOf,
                  observedAt,
                  mappingVersion: input.mappingVersion ?? 'unknown',
                  syncRunId: input.syncRunId,
                }),
              ],
            );
          }

          const accountSnapshotId = randomUUID();
          accountSnapshotIds.push(accountSnapshotId);
          await transaction.query(
            `insert into account_snapshots (
               id, sync_run_id, account_id, provider_total, modeled_total,
               residual, tolerance, supported_position_value,
               unsupported_detail_value, cash_value, accrued_value,
               inclusion_reason, source_window_start, source_window_end,
               total_kind, included, reconciliation_state, quality, source_as_of,
               calculation_version, provenance
             ) values (
               $1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::numeric,
               $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12, $13,
               $14, $15, $16, $17, $18, $19, $20, $21::jsonb
             )`,
            [
              accountSnapshotId,
              input.syncRunId,
              persistedAccountId,
              account.providerTotal,
              account.modeledTotal,
              account.residual,
              account.tolerance,
              account.supportedPositionValue,
              account.unsupportedDetailValue,
              account.cash,
              account.accrued,
              account.inclusionReason,
              account.sourceWindowStart,
              account.sourceWindowEnd,
              account.totalKind,
              account.included,
              account.reconciliationState,
              account.coverage,
              account.portfolioSourceAsOf,
              input.calculationVersion,
              JSON.stringify({
                source: 'robinhood_readonly',
                endpoints: {
                  accounts: {
                    sourceAsOf: account.accountSourceAsOf,
                    responseChecksum: account.accountChecksum,
                  },
                  portfolio: {
                    sourceAsOf: account.portfolioSourceAsOf,
                    responseChecksum: account.portfolioChecksum,
                  },
                  equityPositions: {
                    responseChecksum: account.equityPositionsChecksum,
                  },
                  optionPositions: {
                    responseChecksum: account.optionPositionsChecksum,
                  },
                },
                sourceAsOf: account.portfolioSourceAsOf,
                observedAt,
                mappingVersion: input.mappingVersion ?? 'unknown',
                syncRunId: input.syncRunId,
              }),
            ],
          );
        }

        await transaction.query(
          `update portfolio_snapshots
           set is_current = false, superseded_at = now()
           where user_id = $1 and is_current = true`,
          [input.userId],
        );
        await transaction.query(
          `insert into portfolio_snapshots (
             id, user_id, sync_run_id, total_value, currency, as_of,
             coverage, freshness, reconciliation_status, calculation_version,
             sync_completeness, source_window_start, source_window_end,
             source_fingerprint, payload, is_current, promoted_at
           ) values (
             $1, $2, $3, $4::numeric, 'USD', $5, $6, $7, $8, $9,
             $10, $11, $12, $13, $14::jsonb, true, now()
           )`,
          [
            input.id,
            input.userId,
            input.syncRunId,
            input.totalValue,
            input.asOf,
            input.coverage,
            input.freshness,
            input.reconciliationStatus,
            input.calculationVersion,
            input.syncCompleteness ?? 'complete',
            sourceWindowStart,
            sourceWindowEnd,
            sourceFingerprint,
            JSON.stringify(input.payload),
          ],
        );
        for (const accountSnapshotId of accountSnapshotIds) {
          await transaction.query(
            `insert into portfolio_snapshot_accounts (
               portfolio_snapshot_id, account_snapshot_id
             ) values ($1, $2)`,
            [input.id, accountSnapshotId],
          );
        }

        if (input.leaseGuard) {
          const completed = await transaction.query<{ id: string }>(
            `update jobs
             set status = 'completed', completed_at = now(), lease_owner = null,
                 lease_expires_at = null, updated_at = now()
             where id = $1 and status = 'running' and lease_owner = $2
             returning id`,
            [input.leaseGuard.jobId, input.leaseGuard.workerId],
          );
          if (completed.rows.length !== 1) {
            throw new SnapshotPersistenceError('job_lease_lost');
          }
        }
        if (input.auditEvent) {
          await transaction.query(
            `insert into audit_events (
               id, user_id, actor, action, scope, metadata
             ) values ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
              randomUUID(),
              input.userId,
              input.auditEvent.actor,
              input.auditEvent.action,
              input.auditEvent.scope,
              JSON.stringify(input.auditEvent.metadata),
            ],
          );
        }
        return { snapshotId: input.id, promoted: true };
      });
    },

    async getCurrent(userId) {
      const result = await database.query<SnapshotRow>(
        `select *
         from portfolio_snapshots
         where user_id = $1 and is_current = true
         order by promoted_at desc
         limit 1`,
        [userId],
      );
      return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
    },

    async countSnapshots(userId) {
      const result = await database.query<{ count: string | number }>(
        'select count(*) as count from portfolio_snapshots where user_id = $1',
        [userId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async recordFailedRun(userId, reason, syncRunId) {
      const id = syncRunId ?? randomUUID();
      await database.query(
        `insert into sync_runs (
           id, user_id, trigger, status, completed_at, failure_reason,
           sync_completeness, metadata
         ) values (
           $1, $2, 'portfolio_refresh', 'failed', now(), $3,
           'failed', '{}'::jsonb
         )
         on conflict (id) do update set
           status = 'failed',
           completed_at = now(),
           failure_reason = excluded.failure_reason,
           sync_completeness = 'failed'`,
        [id, userId, reason],
      );
      return id;
    },

    async getExpectedAccountKeys(userId) {
      const result = await database.query<{ provider_account_key: string }>(
        `select distinct a.provider_account_key
         from accounts a
         where a.user_id = $1
           and a.provider = 'robinhood'
           and a.provider_account_key is not null
           and (
             a.status = 'active'
             or exists (
               select 1
               from account_snapshots account_snapshot
               join portfolio_snapshot_accounts link
                 on link.account_snapshot_id = account_snapshot.id
               join portfolio_snapshots portfolio_snapshot
                 on portfolio_snapshot.id = link.portfolio_snapshot_id
               where account_snapshot.account_id = a.id
                 and portfolio_snapshot.is_current = true
                 and account_snapshot.included = true
                 and account_snapshot.provider_total <> 0
             )
           )`,
        [userId],
      );
      return result.rows.map((row) => row.provider_account_key);
    },

    async listOwnerRefreshStates() {
      const result = await database.query<{
        user_id: string;
        last_successful_refresh_at: string | Date | null;
        current_snapshot_as_of: string | Date | null;
      }>(
        `select
           owner.id as user_id,
           (
             select max(run.completed_at)
             from sync_runs run
             where run.user_id = owner.id and run.status = 'succeeded'
           ) as last_successful_refresh_at,
           (
             select snapshot.as_of
             from portfolio_snapshots snapshot
             where snapshot.user_id = owner.id and snapshot.is_current = true
             limit 1
           ) as current_snapshot_as_of
         from users owner`,
      );
      return result.rows.map((row) => ({
        userId: row.user_id,
        lastSuccessfulRefreshAt:
          row.last_successful_refresh_at === null
            ? null
            : toIso(row.last_successful_refresh_at),
        currentSnapshotAsOf:
          row.current_snapshot_as_of === null
            ? null
            : toIso(row.current_snapshot_as_of),
      }));
    },
  };
}

function createImportRepository(database: DatabaseClient): ImportRepository {
  return {
    async createBatch(input) {
      await database.query(
        `insert into import_batches (
           id, user_id, source_type, file_sha256, original_filename, status,
           parser_version, mapping_version, evidence_retention
         ) values ($1, $2, $3, $4, $5, 'preview', $6, $7, 'encrypted_90_days')`,
        [
          input.id,
          input.userId,
          input.sourceType,
          input.fileSha256,
          input.originalFilename,
          input.parserVersion,
          input.mappingVersion,
        ],
      );
    },
  };
}

function createAlertRepository(database: DatabaseClient): AlertRepository {
  return {
    async appendEvent(input) {
      await database.query(
        `insert into alert_events (
           id, rule_id, fingerprint, state, evidence
         ) values ($1, $2, $3, $4, $5::jsonb)
         on conflict (fingerprint) do nothing`,
        [
          input.id,
          input.ruleId,
          input.fingerprint,
          input.state,
          JSON.stringify(input.evidence),
        ],
      );
    },
  };
}

function createAuditRepository(database: DatabaseClient): AuditRepository {
  return {
    async append(input) {
      const id = input.id ?? randomUUID();
      await database.query(
        `insert into audit_events (
           id, user_id, actor, action, scope, metadata, request_id
         ) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          id,
          input.userId,
          input.actor,
          input.action,
          input.scope,
          JSON.stringify(input.metadata ?? {}),
          input.requestId ?? null,
        ],
      );
      return id;
    },
  };
}

export interface RepositorySet {
  portfolios: PortfolioRepository;
  imports: ImportRepository;
  alerts: AlertRepository;
  jobs: JobRepository;
  audit: AuditRepository;
}

export function createRepositories(
  database: DatabaseClient,
  security: RepositorySecurityOptions = {},
): RepositorySet {
  return {
    portfolios: createPortfolioRepository(database, security),
    imports: createImportRepository(database),
    alerts: createAlertRepository(database),
    jobs: createJobRepository(database),
    audit: createAuditRepository(database),
  };
}
