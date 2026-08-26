import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    clerkUserId: text('clerk_user_id').unique(),
    screenPrivacyDefault: boolean('screen_privacy_default').notNull().default(false),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('users_email_normalized_unique').on(sql`lower(${table.email})`),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountKey: text('provider_account_key'),
    displayName: text('display_name').notNull(),
    maskedAccountNumber: text('masked_account_number'),
    status: text('status').notNull(),
    totalKind: text('total_kind').notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('accounts_provider_ref_unique').on(
      table.userId,
      table.provider,
      table.providerAccountKey,
    ),
    index('accounts_user_idx').on(table.userId),
  ],
);

export const securities = pgTable(
  'securities',
  {
    id: uuid('id').primaryKey(),
    providerInstrumentRef: text('provider_instrument_ref'),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    assetClass: text('asset_class').notNull(),
    currency: text('currency').notNull(),
    supported: boolean('supported').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('securities_provider_ref_unique').on(table.providerInstrumentRef),
    index('securities_symbol_idx').on(table.symbol),
  ],
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trigger: text('trigger').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }),
    failureReason: text('failure_reason'),
    syncCompleteness: text('sync_completeness'),
    sourceWindowStart: timestamp('source_window_start', {
      withTimezone: true,
      mode: 'string',
    }),
    sourceWindowEnd: timestamp('source_window_end', {
      withTimezone: true,
      mode: 'string',
    }),
    sourceFingerprint: text('source_fingerprint'),
    mappingVersion: text('mapping_version'),
    calculationVersion: text('calculation_version'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index('sync_runs_user_started_idx').on(table.userId, table.startedAt)],
);

export const positionObservations = pgTable(
  'position_observations',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    securityId: uuid('security_id')
      .notNull()
      .references(() => securities.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 40, scale: 18 }).notNull(),
    providerMarketValue: numeric('provider_market_value', {
      precision: 30,
      scale: 10,
    }),
    costBasis: numeric('cost_basis', { precision: 30, scale: 10 }),
    costBasisSource: text('cost_basis_source').notNull(),
    currency: text('currency').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }).notNull(),
    quality: text('quality').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex('position_observations_sync_account_security_unique').on(
      table.syncRunId,
      table.accountId,
      table.securityId,
    ),
  ],
);

export const cashObservations = pgTable(
  'cash_observations',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    settledCash: numeric('settled_cash', { precision: 30, scale: 10 }),
    buyingPower: numeric('buying_power', { precision: 30, scale: 10 }),
    accrued: numeric('accrued', { precision: 30, scale: 10 }),
    currency: text('currency').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }).notNull(),
    quality: text('quality').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex('cash_observations_sync_account_unique').on(
      table.syncRunId,
      table.accountId,
    ),
  ],
);

export const quoteObservations = pgTable(
  'quote_observations',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id').references(() => syncRuns.id, {
      onDelete: 'restrict',
    }),
    securityId: uuid('security_id')
      .notNull()
      .references(() => securities.id, { onDelete: 'restrict' }),
    price: numeric('price', { precision: 30, scale: 10 }).notNull(),
    currency: text('currency').notNull(),
    marketState: text('market_state').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }).notNull(),
    quality: text('quality').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [index('quote_observations_security_asof_idx').on(table.securityId, table.sourceAsOf)],
);

export const optionObservations = pgTable(
  'option_observations',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    providerOptionKey: text('provider_option_key').notNull(),
    symbol: text('symbol').notNull(),
    quantity: numeric('quantity', { precision: 40, scale: 18 }).notNull(),
    providerMarketValue: numeric('provider_market_value', {
      precision: 30,
      scale: 10,
    }).notNull(),
    currency: text('currency').notNull(),
    detailSupport: text('detail_support').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }).notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex('option_observations_sync_account_option_unique').on(
      table.syncRunId,
      table.accountId,
      table.providerOptionKey,
    ),
  ],
);

export const accountSnapshots = pgTable(
  'account_snapshots',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    providerTotal: numeric('provider_total', { precision: 30, scale: 10 }),
    modeledTotal: numeric('modeled_total', { precision: 30, scale: 10 }),
    residual: numeric('residual', { precision: 30, scale: 10 }),
    tolerance: numeric('tolerance', { precision: 30, scale: 10 }),
    supportedPositionValue: numeric('supported_position_value', {
      precision: 30,
      scale: 10,
    }),
    unsupportedDetailValue: numeric('unsupported_detail_value', {
      precision: 30,
      scale: 10,
    }),
    cashValue: numeric('cash_value', { precision: 30, scale: 10 }),
    accruedValue: numeric('accrued_value', { precision: 30, scale: 10 }),
    inclusionReason: text('inclusion_reason').notNull().default('active'),
    sourceWindowStart: timestamp('source_window_start', {
      withTimezone: true,
      mode: 'string',
    }),
    sourceWindowEnd: timestamp('source_window_end', {
      withTimezone: true,
      mode: 'string',
    }),
    totalKind: text('total_kind').notNull(),
    included: boolean('included').notNull(),
    reconciliationState: text('reconciliation_state').notNull(),
    quality: text('quality').notNull(),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }).notNull(),
    calculationVersion: text('calculation_version').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('account_snapshots_sync_account_unique').on(
      table.syncRunId,
      table.accountId,
    ),
  ],
);

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'restrict' }),
    totalValue: numeric('total_value', { precision: 30, scale: 10 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    asOf: timestamp('as_of', { withTimezone: true, mode: 'string' }).notNull(),
    coverage: text('coverage').notNull(),
    freshness: text('freshness').notNull(),
    reconciliationStatus: text('reconciliation_status').notNull(),
    calculationVersion: text('calculation_version').notNull(),
    syncCompleteness: text('sync_completeness').notNull().default('complete'),
    sourceWindowStart: timestamp('source_window_start', {
      withTimezone: true,
      mode: 'string',
    }),
    sourceWindowEnd: timestamp('source_window_end', {
      withTimezone: true,
      mode: 'string',
    }),
    sourceFingerprint: text('source_fingerprint'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    promotedAt: timestamp('promoted_at', { withTimezone: true, mode: 'string' }),
    supersededAt: timestamp('superseded_at', { withTimezone: true, mode: 'string' }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('portfolio_snapshots_sync_unique').on(table.syncRunId),
    uniqueIndex('portfolio_snapshots_source_fingerprint_unique').on(
      table.userId,
      table.sourceFingerprint,
      table.calculationVersion,
    ),
    index('portfolio_snapshots_user_asof_idx').on(table.userId, table.asOf),
    uniqueIndex('portfolio_snapshots_one_current_per_user')
      .on(table.userId)
      .where(sql`${table.isCurrent} = true`),
  ],
);

export const portfolioSnapshotAccounts = pgTable(
  'portfolio_snapshot_accounts',
  {
    portfolioSnapshotId: uuid('portfolio_snapshot_id')
      .notNull()
      .references(() => portfolioSnapshots.id, { onDelete: 'cascade' }),
    accountSnapshotId: uuid('account_snapshot_id')
      .notNull()
      .references(() => accountSnapshots.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('portfolio_snapshot_accounts_unique').on(
      table.portfolioSnapshotId,
      table.accountSnapshotId,
    ),
  ],
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    fileSha256: text('file_sha256').notNull(),
    originalFilename: text('original_filename').notNull(),
    status: text('status').notNull(),
    parserVersion: text('parser_version').notNull(),
    mappingVersion: text('mapping_version').notNull(),
    evidenceRetention: text('evidence_retention').notNull(),
    evidenceExpiresAt: timestamp('evidence_expires_at', {
      withTimezone: true,
      mode: 'string',
    }),
    ...auditColumns,
  },
  (table) => [uniqueIndex('import_batches_user_hash_unique').on(table.userId, table.fileSha256)],
);

export const importRows = pgTable(
  'import_rows',
  {
    id: uuid('id').primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    sourceLocation: text('source_location').notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    rawChecksum: text('raw_checksum').notNull(),
    status: text('status').notNull(),
    normalizedPreview: jsonb('normalized_preview').$type<Record<string, unknown>>(),
    errors: jsonb('errors').$type<unknown[]>().notNull().default([]),
    ...auditColumns,
  },
  (table) => [uniqueIndex('import_rows_batch_fingerprint_unique').on(table.batchId, table.sourceFingerprint)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'restrict',
    }),
    kind: text('kind').notNull(),
    amount: numeric('amount', { precision: 30, scale: 10 }).notNull(),
    currency: text('currency').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true, mode: 'string' }).notNull(),
    sourceTransactionId: text('source_transaction_id'),
    sourceFingerprint: text('source_fingerprint').notNull(),
    description: text('description').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('transactions_user_fingerprint_unique').on(
      table.userId,
      table.sourceFingerprint,
    ),
    index('transactions_user_effective_idx').on(table.userId, table.effectiveAt),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'string' }),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    ...auditColumns,
  },
  (table) => [index('jobs_claim_idx').on(table.status, table.availableAt)],
);

export const benchmarkObservations = pgTable(
  'benchmark_observations',
  {
    id: uuid('id').primaryKey(),
    symbol: text('symbol').notNull(),
    value: numeric('value', { precision: 30, scale: 10 }).notNull(),
    currency: text('currency').notNull(),
    methodology: text('methodology').notNull(),
    sourceAsOf: timestamp('source_as_of', { withTimezone: true, mode: 'string' }).notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex('benchmark_symbol_asof_unique').on(table.symbol, table.sourceAsOf)],
);

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  threshold: jsonb('threshold').$type<Record<string, unknown>>().notNull(),
  baseline: text('baseline'),
  cooldownSeconds: integer('cooldown_seconds').notNull(),
  dailyCap: integer('daily_cap').notNull(),
  mutedUntil: timestamp('muted_until', { withTimezone: true, mode: 'string' }),
  ...auditColumns,
});

export const alertEvents = pgTable(
  'alert_events',
  {
    id: uuid('id').primaryKey(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => alertRules.id, { onDelete: 'cascade' }),
    snapshotId: uuid('snapshot_id').references(() => portfolioSnapshots.id, {
      onDelete: 'restrict',
    }),
    fingerprint: text('fingerprint').notNull(),
    state: text('state').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    ...auditColumns,
  },
  (table) => [uniqueIndex('alert_events_fingerprint_unique').on(table.fingerprint)],
);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey(),
  alertEventId: uuid('alert_event_id')
    .notNull()
    .references(() => alertEvents.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  status: text('status').notNull(),
  attemptedAt: timestamp('attempted_at', { withTimezone: true, mode: 'string' }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'string' }),
  failureReason: text('failure_reason'),
  ...auditColumns,
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    scope: text('scope').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    requestId: text('request_id'),
    ...auditColumns,
  },
  (table) => [index('audit_events_user_created_idx').on(table.userId, table.createdAt)],
);

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    salt: text('salt').notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex('recovery_codes_hash_unique').on(table.codeHash)],
);

export const robinhoodOauthCredentials = pgTable(
  'robinhood_oauth_credentials',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    clientInformation: text('client_information'),
    tokenSet: text('token_set'),
    connectionState: text('connection_state').notNull(),
    tokenUpdatedAt: timestamp('token_updated_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', {
      withTimezone: true,
      mode: 'string',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('robinhood_oauth_credentials_owner_provider_unique').on(
      table.userId,
      table.provider,
    ),
    index('robinhood_oauth_credentials_provider_idx').on(table.provider),
  ],
);
