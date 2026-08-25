CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  clerk_user_id text UNIQUE,
  screen_privacy_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_ref text,
  display_name text NOT NULL,
  masked_account_number text,
  status text NOT NULL CHECK (status IN ('active', 'closed')),
  total_kind text NOT NULL CHECK (
    total_kind IN ('provider_portfolio_value', 'net_liquidation_value', 'account_equity', 'unknown')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_provider_ref_unique
  ON accounts(user_id, provider, provider_account_ref)
  WHERE provider_account_ref IS NOT NULL;
CREATE INDEX accounts_user_idx ON accounts(user_id);

CREATE TABLE securities (
  id uuid PRIMARY KEY,
  provider_instrument_ref text UNIQUE,
  symbol text NOT NULL,
  name text NOT NULL,
  asset_class text NOT NULL,
  currency text NOT NULL,
  supported boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX securities_symbol_idx ON securities(symbol);

CREATE TABLE sync_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_as_of timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX sync_runs_user_started_idx ON sync_runs(user_id, started_at DESC);

CREATE TABLE position_observations (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  security_id uuid NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  quantity numeric(40, 18) NOT NULL,
  provider_market_value numeric(30, 10),
  cost_basis numeric(30, 10),
  cost_basis_source text NOT NULL,
  currency text NOT NULL,
  observed_at timestamptz NOT NULL,
  source_as_of timestamptz NOT NULL,
  quality text NOT NULL,
  provenance jsonb NOT NULL,
  UNIQUE(sync_run_id, account_id, security_id)
);

CREATE TABLE cash_observations (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  settled_cash numeric(30, 10),
  buying_power numeric(30, 10),
  accrued numeric(30, 10),
  currency text NOT NULL,
  observed_at timestamptz NOT NULL,
  source_as_of timestamptz NOT NULL,
  quality text NOT NULL,
  provenance jsonb NOT NULL,
  UNIQUE(sync_run_id, account_id)
);

CREATE TABLE quote_observations (
  id uuid PRIMARY KEY,
  sync_run_id uuid REFERENCES sync_runs(id) ON DELETE RESTRICT,
  security_id uuid NOT NULL REFERENCES securities(id) ON DELETE RESTRICT,
  price numeric(30, 10) NOT NULL,
  currency text NOT NULL,
  market_state text NOT NULL,
  observed_at timestamptz NOT NULL,
  source_as_of timestamptz NOT NULL,
  quality text NOT NULL,
  provenance jsonb NOT NULL
);
CREATE INDEX quote_observations_security_asof_idx
  ON quote_observations(security_id, source_as_of DESC);

CREATE TABLE account_snapshots (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  provider_total numeric(30, 10),
  modeled_total numeric(30, 10),
  residual numeric(30, 10),
  tolerance numeric(30, 10),
  total_kind text NOT NULL,
  included boolean NOT NULL,
  reconciliation_state text NOT NULL,
  quality text NOT NULL,
  source_as_of timestamptz NOT NULL,
  calculation_version text NOT NULL,
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sync_run_id, account_id)
);

CREATE TABLE portfolio_snapshots (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_run_id uuid NOT NULL UNIQUE REFERENCES sync_runs(id) ON DELETE RESTRICT,
  total_value numeric(30, 10) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  as_of timestamptz NOT NULL,
  coverage text NOT NULL,
  freshness text NOT NULL,
  reconciliation_status text NOT NULL,
  calculation_version text NOT NULL,
  payload jsonb NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  promoted_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_snapshots_user_asof_idx
  ON portfolio_snapshots(user_id, as_of DESC);
CREATE UNIQUE INDEX portfolio_snapshots_one_current_per_user
  ON portfolio_snapshots(user_id)
  WHERE is_current = true;

CREATE TABLE portfolio_snapshot_accounts (
  portfolio_snapshot_id uuid NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  account_snapshot_id uuid NOT NULL REFERENCES account_snapshots(id) ON DELETE RESTRICT,
  PRIMARY KEY(portfolio_snapshot_id, account_snapshot_id)
);

CREATE TABLE import_batches (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  file_sha256 text NOT NULL,
  original_filename text NOT NULL,
  status text NOT NULL,
  parser_version text NOT NULL,
  mapping_version text NOT NULL,
  evidence_retention text NOT NULL,
  evidence_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_sha256)
);

CREATE TABLE import_rows (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source_location text NOT NULL,
  source_fingerprint text NOT NULL,
  raw_checksum text NOT NULL,
  status text NOT NULL,
  normalized_preview jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id, source_fingerprint)
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  amount numeric(30, 10) NOT NULL,
  currency text NOT NULL,
  effective_at timestamptz NOT NULL,
  source_transaction_id text,
  source_fingerprint text NOT NULL,
  description text NOT NULL,
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_fingerprint)
);
CREATE INDEX transactions_user_effective_idx
  ON transactions(user_id, effective_at DESC);

CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'completed', 'failed')
  ),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim_idx ON jobs(status, available_at, created_at);

CREATE TABLE benchmark_observations (
  id uuid PRIMARY KEY,
  symbol text NOT NULL,
  value numeric(30, 10) NOT NULL,
  currency text NOT NULL,
  methodology text NOT NULL,
  source_as_of timestamptz NOT NULL,
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol, source_as_of)
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  threshold jsonb NOT NULL,
  baseline text,
  cooldown_seconds integer NOT NULL,
  daily_cap integer NOT NULL,
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_events (
  id uuid PRIMARY KEY,
  rule_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES portfolio_snapshots(id) ON DELETE RESTRICT,
  fingerprint text NOT NULL UNIQUE,
  state text NOT NULL,
  evidence jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY,
  alert_event_id uuid NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL,
  attempted_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor text NOT NULL,
  action text NOT NULL,
  scope text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_user_created_idx ON audit_events(user_id, created_at DESC);

CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  salt text NOT NULL,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
