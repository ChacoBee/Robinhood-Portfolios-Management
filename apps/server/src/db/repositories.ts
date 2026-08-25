import { randomUUID } from 'node:crypto';
import { normalizeDecimal } from '@aurum/domain';
import type { DatabaseClient } from './client';
import { createJobRepository, type JobRepository } from './jobs';

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
  payload: Record<string, unknown>;
  promotedAt: string;
}

export interface PortfolioRepository {
  createOwner(input: CreateOwnerInput): Promise<void>;
  promoteSnapshot(input: PromotePortfolioSnapshotInput): Promise<void>;
  getCurrent(userId: string): Promise<PortfolioSnapshotRecord | null>;
  countSnapshots(userId: string): Promise<number>;
  recordFailedRun(userId: string, reason: string): Promise<string>;
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
  payload: Record<string, unknown> | string;
  promoted_at: string | Date;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : row.payload,
    promotedAt: toIso(row.promoted_at),
  };
}

function createPortfolioRepository(database: DatabaseClient): PortfolioRepository {
  return {
    async createOwner(input) {
      await database.query(
        `insert into users (id, email)
         values ($1, lower($2))
         on conflict (id) do update set email = excluded.email`,
        [input.id, input.email],
      );
    },

    async promoteSnapshot(input) {
      await database.transaction(async (transaction) => {
        await transaction.query(
          `insert into sync_runs (
             id, user_id, trigger, status, completed_at, source_as_of, metadata
           ) values ($1, $2, 'snapshot_promotion', 'succeeded', now(), $3, '{}'::jsonb)
           on conflict (id) do nothing`,
          [input.syncRunId, input.userId, input.asOf],
        );
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
             payload, is_current, promoted_at
           ) values (
             $1, $2, $3, $4::numeric, 'USD', $5, $6, $7, $8, $9,
             $10::jsonb, true, now()
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
            JSON.stringify(input.payload),
          ],
        );
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

    async recordFailedRun(userId, reason) {
      const id = randomUUID();
      await database.query(
        `insert into sync_runs (
           id, user_id, trigger, status, completed_at, failure_reason, metadata
         ) values ($1, $2, 'portfolio_refresh', 'failed', now(), $3, '{}'::jsonb)`,
        [id, userId, reason],
      );
      return id;
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

export function createRepositories(database: DatabaseClient): RepositorySet {
  return {
    portfolios: createPortfolioRepository(database),
    imports: createImportRepository(database),
    alerts: createAlertRepository(database),
    jobs: createJobRepository(database),
    audit: createAuditRepository(database),
  };
}
