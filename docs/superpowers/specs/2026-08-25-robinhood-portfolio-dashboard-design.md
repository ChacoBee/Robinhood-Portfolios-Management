# Aurum Portfolio Dashboard — Design Specification

**Date:** 2026-08-25

**Status:** Approved for implementation by blanket user authorization

**Repository:** `ChacoBee/Robinhood-Portfolios-Management`
**Audience:** One private owner using desktop and mobile devices

## 1. Product intent

Aurum is a private, read-only portfolio command center for the owner's Robinhood accounts. The default screen must answer two questions within five seconds:

**Product name:** Aurum. **Visual system:** Obsidian Gold.

1. How much is the portfolio worth now?
2. Where is the money allocated, and what materially changed?

The application combines current Robinhood account data, normalized imported history, and application-generated snapshots. It must be explicit about freshness, provenance, incomplete coverage, and unsupported asset classes. It must never expose trading, transfer, cancellation, or other account-mutating actions.

### Goals

- Show all discovered Robinhood accounts in one responsive dashboard.
- Refresh current balances, positions, quotes, and buying power near real time while the market is open.
- Build durable history from scheduled snapshots plus Robinhood CSV/activity and review-required statement imports.
- Explain allocation, concentration, gains/losses, cash, and account-level composition.
- Deliver factual in-app, email, and web-push alerts with evidence and cooldowns.
- Preserve privacy and fail safely when the source is stale, partial, unavailable, or inconsistent.
- Keep the codebase portable and maintainable in a public GitHub repository without secrets or personal financial data.

### Non-goals

- Placing or preparing trades, options orders, transfers, or cancellations.
- Giving personalized investment recommendations or forecasting returns.
- Tax-lot-grade accounting, tax filing, or representing estimated cost basis as tax truth.
- Tick-by-tick streaming, social features, news feeds, gamification, or AI stock picks.
- Silently substituting a zero when a provider field or asset class is unsupported.

## 2. Confirmed product decisions

- Single-user private application.
- Robinhood integration is strictly read-only and server-side.
- Private cloud access across devices.
- Smart refresh: load-time refresh, approximately 60 seconds while US markets are open, slower off-hours, and a manual refresh control.
- Historical coverage comes from imported files plus ongoing immutable snapshots.
- Primary authentication is passkey-based with an allowlisted email and one-time recovery codes.
- Alerts support in-app delivery, email, and web push.
- Visual direction is **Obsidian Gold**: charcoal surfaces, restrained champagne-gold accents, and green/red reserved for positive/negative financial meaning.
- Default layout is a panoramic overview: total value, trend, account/allocation composition, then holdings and actionable detail.
- Architecture is a portable modular monolith rather than a collection of premature microservices.

## 3. Information architecture

Primary navigation:

1. **Overview** — total value, daily movement, freshness, history, allocation, account mix, top holdings, and one concise insight.
2. **Accounts** — all active and closed accounts; account detail with balances, positions, and contribution to total value.
3. **Holdings** — searchable and sortable positions; security detail, account distribution, cost-basis availability, and current quote provenance.
4. **Performance** — portfolio value, dollar and percentage movement, external cash-flow markers, comparison periods, and benchmark when compatible data exists.
5. **Analytics** — asset/account allocation, concentration, cash exposure, winners/losers, and transparent data-quality caveats.
6. **Activity & Imports** — tabs for normalized timeline, imports, and reconciliation; includes deposits/withdrawals, dividends, fees, parser exceptions, and source lineage.
7. **Alerts** — alert inbox, factual rule builder, delivery status, evidence, cooldown, mark-read, mute, and snooze.
8. **Settings** — Robinhood connection health, passkeys/recovery, notification channels, retention, privacy controls, export, and deletion. Import execution and batch review live only under Activity & Imports.

Desktop uses a compact left rail. Mobile uses bottom navigation for Overview, Holdings, Activity, Alerts, and More. More contains Accounts, Performance, Analytics, and Settings. Detail routes have a visible back affordance and stable route title; filters and date ranges survive return navigation. Bottom navigation is hidden only during focused authentication and import steps. Every route retains the same global freshness indicator and Screen Privacy Mode control.

The Overview first viewport has a fixed hierarchy: (1) total value and source-as-of time, (2) daily change and completeness label, (3) value trend, (4) allocation including cash and unsupported/residual categories, and (5) top holdings. Allocation visibly reconciles to the headline total or states why whole-portfolio reconciliation is unavailable.

## 4. Core user flows

### First use

1. Owner signs in with an allowlisted identity and registers a passkey.
2. Application confirms the Robinhood read-only connection and enumerates accounts.
3. Initial sync validates and stores a coherent current snapshot.
4. Owner may import Robinhood activity or statement files to extend history.
5. Dashboard opens with source coverage, freshness, and unsupported categories clearly stated.

### Routine use

1. Last-known data renders immediately.
2. A background refresh starts if the snapshot is older than the applicable freshness threshold.
3. The UI keeps the last-good values visible while showing a refreshing state.
4. A successful coherent sync atomically replaces the current view and appends a snapshot.
5. A failed or partial sync preserves the last-good view and shows an actionable status rather than blanking the dashboard.

### Import

Upload → validate → preview mappings and conflicts → confirm → normalize → reconcile → report. CSV is the preferred structured source. PDF statement files are parsed into a review-required draft with page/line provenance; unmatched or low-confidence entries remain unresolved and are never silently normalized. The system hashes each file, records parser/mapping versions and provenance, and conservatively deduplicates transactions.

An encrypted immutable original or encrypted canonical raw-row archive is retained for 90 days by default so a normalization can be reproduced. The owner may choose immediate deletion; that batch is then labeled `non-reproducible`, and the application may not make audit-grade reconstruction claims from it. Every normalized transaction keeps its batch, source-row/page reference, source-row fingerprint, and parser/mapping version.

## 5. Visual and interaction system

### Palette

- Page background: near-black charcoal, not pure black.
- Surfaces: layered graphite with subtle warm borders.
- Primary accent: matte champagne gold; no neon yellow or excessive gradients.
- Positive financial value: accessible green.
- Negative financial value: accessible red.
- Neutral/unknown/stale: cool gray or amber depending on severity.

Gold communicates hierarchy and interaction, never gains. Green/red communicate financial direction only. Charts must remain understandable without relying on color alone.

### Typography and density

- Modern sans-serif with tabular numerals for financial values.
- Hero total is prominent but not theatrical.
- Dense enough for expert scanning on desktop, with clear grouping and generous touch targets on mobile.
- Currency is formatted consistently in USD; timestamps display in America/New_York with explicit source-as-of text.

### Responsive behavior

- 360 px mobile baseline, tablet two-column reflow, and wide desktop panoramic layout.
- Tables collapse into accessible cards or horizontal-scrolling regions with sticky identifiers.
- Charts support touch tooltips, keyboard focus, and reduced-motion preferences.
- Screen Privacy Mode replaces sensitive rendered number text with masked equivalents while preserving non-sensitive labels and structure. It is session-local, has an accessible toggle/announcement, and is explicitly not an authorization boundary.

### Required operational states

Every data-bearing component supports: loading, refreshing with retained values, empty, unsupported, partial, stale, disconnected, source error, import error, and recovery. Missing and unsupported values render as `Unavailable` or `Not reported`, never as inferred zero.

- Initial loading uses layout-matched skeletons.
- Refreshing retains values and the prior source timestamp; focus is not reset.
- Partial states identify every affected metric and excluded scope.
- Stale states retain last-good data, explain the reason, and expose a rate-limited retry.
- Disconnected states permit imported history but make no live-data claim.
- Unsupported values remain an explicit excluded/residual category.
- Import errors preserve mapping progress and identify the row, column, page, or unresolved rule.
- Empty states distinguish no source, no holdings, and no history.

### Accessibility contract

- WCAG 2.2 AA contrast for text and controls, with a visible focus indicator meeting 3:1 non-text contrast.
- Movement and status always use text/icon/pattern in addition to color.
- Each chart provides a semantic table or downloadable text summary and keyboard-operable point navigation.
- Refresh and connection-status changes use a polite live region without stealing focus.
- Reduced motion is honored, touch targets are at least 44 by 44 CSS pixels, and imports/errors never discard keyboard focus or entered progress.
- Horizontal scrolling is limited to true comparison tables with a sticky first column and visible scroll cue.

Semantic tokens are distinct: `accent-gold` is only for action/selection; `warning-amber` is only for degraded/stale status; `success-green` and `loss-red` are only for financial direction; `neutral-gray` represents unknown. Gold and amber must not share the same luminance treatment on dark surfaces.

## 6. Technical architecture

### Stack

- Next.js-compatible React application written in TypeScript.
- Tailwind CSS plus accessible headless primitives and a custom Obsidian Gold design system.
- Apache ECharts for interactive time series and allocation visualizations.
- A Sites-compatible Vinext/App Router frontend plus a Node/TypeScript API and sync worker in the same repository and domain model.
- PostgreSQL with Drizzle ORM; production access uses TLS and a transaction-capable, pool-aware driver.
- PostgreSQL-backed job coordination initially; no separate queue service until measured load requires one.
- S3-compatible encrypted object storage for retained import evidence and generated exports.
- Clerk for managed passkey authentication, a server-enforced email allowlist, application-held hashed recovery codes, secure sessions, and production fail-closed configuration.
- Resend for email, standards-based VAPID web push, and an optional Polygon market-data adapter for compatible benchmark data.

The repository is a small workspace with three boundaries: `apps/web` is the Vinext/App Router presentation surface, `apps/server` is the Node API plus worker entry points, and `packages/domain` contains shared validated contracts and pure calculations. The browser calls only the typed HTTPS API in connected mode. Domain modules remain one modular system rather than separately owned microservices.

OpenAI Sites hosts the synthetic Demo preview and may host the connected presentation surface because it needs only outbound HTTPS to the API. It never receives Robinhood or database credentials. Connected production deploys the Node API and one dedicated worker from the same Docker image on a container-capable runtime; schema migrations run as a separate release step. That runtime provides persistent worker execution, managed secrets, scheduled triggers, outbound HTTPS, and TLS access to PostgreSQL. Deployment-provider credentials remain an operator step.

### Module boundaries

- `identity`: user, allowlist, session, passkey, recovery, privacy settings.
- `portfolio`: accounts, securities, positions, cash, quotes, valuations, and read models.
- `sync`: refresh policy, locking, retries, source validation, and last-good promotion.
- `integrations/robinhood`: fixed read-only tool allowlist and provider payload mapping.
- `imports`: file validation, parsing, preview, normalization, deduplication, and reconciliation.
- `performance`: snapshots, external flows, return calculations, and benchmark compatibility.
- `alerts`: rules, evaluation, cooldowns, evidence, inbox, and delivery adapters.
- `operations`: health, audit events, source status, data export, and deletion.

### Live-data boundary

The browser never talks directly to Robinhood and never receives Robinhood credentials. Only the server-side adapter may invoke a statically defined allowlist of read methods. Browser-supplied tool names, generic MCP proxies, and write-capable methods are forbidden.

Current account values, cash, buying power, positions, and available quotes originate from Robinhood MCP. Historical charts originate from stored snapshots and normalized imports. Allocation, concentration, reconciliation, and performance metrics are calculated by Aurum. Benchmarks originate from a separately configured market-data provider.

A live integration exists only when Robinhood provides a separately provisioned, durable application-side MCP/OAuth client with verified read-only scopes for the selected environment. Development-agent, browser, and Codex connector credentials are never exported, reused, proxied, or treated as application credentials. Until the deployed flow is verified, the adapter uses synthetic or sanitized contract fixtures and the application remains in clearly labeled Demo/Disconnected mode; it must not imply a live connection.

## 7. Data model and provenance

Core entities:

- `user_profile`
- `account`
- `security`
- `position_observation`
- `cash_observation`
- `quote_observation`
- `portfolio_snapshot`
- `transaction`
- `import_batch`
- `sync_run`
- `benchmark_observation`
- `alert_rule`
- `alert_event`
- `notification_delivery`
- `audit_event`

Observations and normalized financial events are immutable. Corrections create superseding records or revised derived views rather than rewriting source facts.

`transaction` records the source transaction ID when supplied; account; normalized and original event types/text; effective and posted timestamps; security; quantity; gross amount; price; fees; currency; source row/page reference; import batch; and versioned dedupe fingerprint. Event types distinguish external deposits/withdrawals, internal transfers, dividends, interest, fees, trades, stock splits/corporate actions, and unknown events.

Enforce uniqueness on `(source, account, source_transaction_id)` when an ID exists. Otherwise use a versioned fingerprint over account, effective date, event type, security, quantity, amount, price, fee, and source lineage. Ambiguous matches require review and are never auto-merged. Re-importing the same file hash is idempotently rejected or linked to the existing batch.

Each financial fact records, where applicable:

- provider/source name;
- source account identifier stored encrypted or tokenized;
- observed-at and source-as-of timestamps in UTC;
- sync run or import batch identifier;
- parser/mapping/calculation version;
- quality state: complete, partial, stale, unsupported, invalid, or reconciled;
- raw-source reference or checksum without committing raw private data.

### Reconciliation

For each account and portfolio snapshot:

`calculated total = supported positions + supported cash + known accrued values`

`unsupported residual = provider-reported total − calculated total`

The UI shows provider-reported total as the headline when trustworthy, calculated total as validation detail, and any non-trivial residual as an explicit unsupported/unexplained component. No residual may be silently classified as cash.

A promoted portfolio snapshot contains one successful account observation per included account from the same sync run. Source-as-of timestamps must be within a 120-second maximum skew unless a provider timestamp is unavailable and the receive-time fallback is explicitly recorded. Each account total is typed as `provider_portfolio_value`, `net_liquidation_value`, `account_equity`, or `unknown`; unknown semantic totals cannot drive the portfolio headline.

Reconciliation is `provider account total − modeled account total` using a USD tolerance of the greater of $0.02 or 0.01% of account value. The residual is classified as `expected_unsupported`, `timing_or_settlement`, or `unexplained`. An unexplained residual over tolerance makes detailed allocation and calculated returns partial. Current totals include active accounts and any closed account with a non-zero validated balance; closed zero-balance accounts remain discoverable but do not enter current denominators. Account inclusion is stored on each snapshot. If promotion fails, the previous last-good snapshot remains current.

Every read model exposes `as_of`, `coverage`, `freshness`, `reconciliation_status`, and `calculation_version`. A metric is `complete` only when all required inputs satisfy their freshness and quality policies; otherwise it is deterministically `partial`, `stale`, or `unavailable`.

## 8. Metric definitions

- **Portfolio value:** sum of semantically validated provider-reported account totals, with calculated values and residuals exposed for reconciliation.
- **Daily change:** change from the prior regular US market-session-close snapshot to the latest coherent snapshot, less net external deposits and withdrawals effective after that close. Dividends, interest, fees, trades, and internal transfers are not external flows. If either boundary snapshot, relevant flow classification, or reconciliation status is unavailable, use provider-reported daily change only when its definition is documented; otherwise render `Unavailable`, not an estimate.
- **Allocation:** uses provider-reported portfolio value only when all included totals pass semantic validation; unsupported/unexplained residual is its own category in that denominator. If the provider total is unavailable or unreconciled beyond tolerance, show only a clearly labeled `supported-assets allocation` and suppress whole-portfolio concentration claims.
- **Unrealized gain/loss:** current supported market value minus supported cost basis. Basis provenance is shown per position as `provider average`, `calculated partial`, or `unavailable`. A calculated basis requires complete normalized history and a declared matching method.
- **Realized gain/loss:** withheld unless disposal events in scope can be matched under an explicit method. Corporate actions, transfers with unknown basis, and unknown events make the affected result partial. Neither realized nor unrealized figures are tax reporting.
- **Concentration:** largest holding/account weights and configurable threshold breaches.
- **Cash exposure:** uses the same eligible denominator as allocation and remains distinct from buying power.
- **Valuation precedence:** provider-reported position market value is primary for a promoted snapshot. Quantity multiplied by quote is validation/fallback only when quote time, USD currency, and market state are compatible. Persist valuation source, price timestamp, market state, and quote freshness. A mixture of regular and extended-hours values is labeled `mixed-market-state` and cannot drive movement alerts.
- **Performance series:** snapshot-based value series with external-flow markers. Until coverage supports a named return method, the UI calls this `portfolio value change`, not `investment return`. Time-weighted or money-weighted returns are deferred until history completeness supports them.
- **Benchmark comparison:** enabled only when the portfolio has a validated flow-adjusted return series for the same period and the benchmark has documented adjusted-close/total-return methodology, USD compatibility, and an aligned trading-session calendar. Source, method, date range, and missing sessions are visible. Price-only benchmark data may appear as a price chart but not comparative performance.

MVP aggregation supports USD-denominated Robinhood accounts and securities only. Non-USD exposure is marked unsupported until a versioned FX observation and conversion policy are implemented; non-USD values are never formatted as USD.

All cards and charts display their period and freshness close to the metric. Cards, charts, and tables must reconcile from shared metric services rather than duplicating formulas in UI code.

## 9. Refresh, resilience, and alerts

### Refresh policy

- On initial page load, return the last-good snapshot immediately and request refresh when stale.
- Interactive refresh targets a 60-second cadence while an authenticated dashboard is active; one client heartbeat represents activity so browser tabs do not call Robinhood independently.
- Background sync is independent of browser activity: every 15 minutes during regular US market sessions, hourly outside sessions, one regular-session-close or next-available daily snapshot per trading day, and one off-hours daily checkpoint. An exchange calendar handles holidays and half-days.
- Manual refresh coalesces with an existing run instead of starting concurrent source calls.
- One Robinhood sync per user at a time, with backoff, jitter, rate limiting, and a circuit breaker. The web process only enqueues deduplicated work; a dedicated worker claims jobs with transactional row locking, unique idempotency keys, expiring leases, retry metadata, and a terminal failed state. A database lease prevents duplicate syncs if another worker starts.
- Writes are idempotent by source key and observation window.
- Successful active refreshes may create intraday observations. High-frequency observations are retained for 30 days; durable daily rollups and source evidence remain until owner deletion. Alert evaluation runs only from promoted snapshots, never directly from page loads.

### Alerts

MVP rules cover data-health failures, stale syncs, portfolio/holding percentage moves, concentration thresholds, cash thresholds, and material value changes. Percentage-move alerts name their baseline: prior regular-session close, prior coherent snapshot, or a fixed reference selected by the owner. Portfolio movement uses a flow-adjusted value when eligible. Financial-movement alerts are suppressed for stale, partial, unreconciled, mixed-market-state, or unsupported-dominant snapshots.

Alerts include the observed value, threshold, source-as-of time, account/holding scope, baseline observation, flow adjustment, calculation version, delivery-decision reason, and a link to evidence. Hysteresis, cooldowns, daily caps, and duplicate suppression prevent notification storms. Suspicious outliers require confirmation by a subsequent coherent observation before external delivery; otherwise only an `unverified data anomaly` may be recorded.

Email and web push are optional adapters: absent credentials disable that channel visibly while retaining in-app alerts.

## 10. Security and privacy

- No order, transfer, cancellation, or write-capable Robinhood code paths.
- Static read-method allowlist enforced at adapter and application-service boundaries.
- Secrets remain in managed environment storage; `.env`, tokens, cookies, passkey material, raw imports, databases, logs, and personal snapshots are ignored by Git.
- Provider payloads and imported files are untrusted: strict schemas, type/range checks, file-size/type limits, formula-injection defenses, and bounded parsing.
- Production authentication fails closed. Any local demo bypass is development-only and cannot activate in production builds.
- Public sign-up is disabled and exactly one Clerk principal is pre-provisioned. Daily authentication requires a WebAuthn passkey. The verified allowlisted email is a server-enforced authorization invariant and is used for enrollment/recovery notifications, never as a silent passwordless fallback.
- Recovery requires both a single-use recovery code and proof of control of the allowlisted email. It creates a short-lived recovery-only session that permits only new-passkey enrollment. Codes are generated once, shown once, salted and slow-hashed, consumed atomically, and revoke existing sessions when used. If Clerk cannot support this flow without weakening it, connected production remains gated rather than falling back to email-only access.
- Short-lived secure cookies, CSRF protection, rate limits, session revocation, and security audit events.
- Account numbers are masked everywhere; stable provider identifiers are encrypted or keyed-hashed at rest.
- Logs are structured and redacted. No full provider payloads, credentials, or financial file contents in logs.
- Content Security Policy, trusted origins, secure headers, dependency auditing, and least-privilege deployment credentials.
- Owner-controlled export and deletion flows with confirmation and audit records.
- Public repository contains synthetic demo fixtures only and states that the project is independent and not affiliated with Robinhood.
- Robinhood OAuth uses authorization code with PKCE, exact HTTPS redirect-URI allowlisting, state and nonce validation, narrow verified read-only scopes, and reauthorization on scope change. Durable refresh credentials are encrypted in a dedicated secret-store/KMS boundary readable only by the worker identity; access tokens remain memory-only where practical.
- Connector egress is limited to approved Robinhood OAuth/MCP hosts. At startup and on connection changes, the adapter records discovered capabilities and fails closed if required read permissions cannot be demonstrated or a configured tool is not on the static allowlist. No route accepts an MCP tool name, tool arguments, or credentials from the browser.
- Production database and object storage are private; only HTTPS application ingress is public. Web, worker, migration, and deployment identities are distinct and least-privileged. Database, OAuth, VAPID, email, and deployment credentials are separate secrets.
- Before the first public push and in CI, scan secrets and reachable Git history. Pull requests and forks never receive production secrets. Synthetic fixtures are reviewed to ensure no identifier, timestamp, value, screenshot, or metadata originates from a real account.
- Deletion removes live records, exports, credentials, and retained source objects. Encrypted backups expire under the documented retention policy and are not individually rewritten.

## 11. Delivery modes

- **Demo mode:** synthetic fixtures, fully labeled, safe for public preview and automated tests.
- **Connected local mode:** requires a separately provisioned application-side Robinhood MCP/OAuth client; development-agent credentials are never reused. Without it, local development remains Demo/Disconnected.
- **Connected production mode:** requires verified deployed read-only MCP/OAuth connectivity, PostgreSQL, Clerk, worker/scheduler, object storage, and notification secrets. The app refuses to represent Demo or stale data as live.

The initial hosted preview may use Demo mode so no private financial data is published. Production connection instructions and an environment-variable contract are included in the repository without secret values.

## 12. Validation strategy

### Automated

- Unit tests for monetary arithmetic, reconciliation, freshness, external-flow adjustment, allocation, deduplication, and alert cooldowns.
- Contract tests for Robinhood payload mapping, unknown fields, missing fields, unsupported categories, and write-method rejection.
- Import tests for valid files, duplicates, malformed rows, large files, and spreadsheet-formula payloads.
- Import tests for duplicate file re-import, cross-batch source-ID dedupe, absent-ID ambiguous-match review, partial batches, unsupported statement entries, and source evidence deletion/non-reproducible status.
- API tests for authentication, authorization, validation, idempotency, rate limiting, and error shapes.
- Component tests for Screen Privacy Mode, freshness, unsupported/partial states, filters, sorting, and mobile navigation.
- End-to-end smoke tests for sign-in/demo access, dashboard load, manual refresh, import preview, alert creation, and responsive route navigation.
- Type checking, linting, production build, dependency audit, and secret scanning.

### Manual and visual

- Verify first viewport at mobile, tablet, desktop, and wide-desktop sizes.
- Confirm keyboard-only navigation, focus visibility, contrast, reduced motion, and chart alternatives.
- Confirm no private account data appears in source, browser logs, screenshots, generated metadata, or hosted Demo mode.
- Exercise loading, refreshing, empty, stale, partial, disconnected, and failure states without losing last-good values.
- Validate WCAG 2.2 AA contrast, 3:1 focus visibility, non-color status cues, keyboard chart navigation, text/table chart alternatives, live-region behavior, 44 px touch targets, and no focus loss after refresh/import errors.

## 13. Acceptance criteria

Implementation is complete when:

1. The responsive Obsidian Gold application fully implements Overview, Accounts, Holdings, Activity & Imports, Settings, and critical operational states; Performance, Analytics, and Alerts implement their enumerated MVP fields without placeholder claims.
2. Demo mode works end to end with synthetic data and is unmistakably labeled.
3. The server-only Robinhood adapter supports only the verified application-authorized read surface, rejects every other discovered/requested method, and produces a coherent normalized snapshot from contract fixtures. Live-production acceptance additionally requires documented proof of deployed OAuth/MCP and granted read-only scopes.
4. Current values and historical values have visible provenance and freshness.
5. CSV activity and review-required statement imports can be previewed, normalized, deduplicated, reconciled, and traced to encrypted retained evidence or an explicit `non-reproducible` deletion choice.
6. Core metrics reconcile and incomplete inputs degrade to partial/unsupported rather than fabricated values.
7. In-app alert rules work; email and web push activate when configured and degrade visibly when not configured.
8. Production configuration fails closed for authentication and source credentials.
9. Automated checks and a production build pass, with responsive and accessibility smoke coverage.
10. Secret scanning and a scan of reachable Git history report no detected credentials or known personal Robinhood data; synthetic fixtures are reviewed and labeled.
11. The reviewed implementation is committed and pushed to `ChacoBee/Robinhood-Portfolios-Management`.

Fixture-based acceptance tests must cover reconciliation inside/outside the declared USD tolerance, unsupported residuals, skewed source times, stale quotes, daily-change deposits/withdrawals/dividends/internal transfers, missing prior close, duplicate and ambiguous imports, manual-refresh coalescing, and scheduled daily history without an active browser.

## 14. Deferred work

- Tax-lot-grade accounting and tax reports.
- Full time-weighted and money-weighted return engines until transaction history is complete enough to validate them.
- Advanced factor/risk modeling, forecasts, recommendations, and scenario simulation.
- Additional brokers, household/multi-user tenancy, collaboration, and native mobile apps.
- Microservices or a dedicated queue until observed scale or reliability demands them.
