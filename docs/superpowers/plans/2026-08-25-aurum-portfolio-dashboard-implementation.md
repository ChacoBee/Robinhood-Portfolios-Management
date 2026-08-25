# Aurum Portfolio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The primary agent must remain the sole Sites owner; subagents may perform read-only review or create the single approved social image outside the checkout.

**Goal:** Build, validate, publish, and push a responsive private-ready Robinhood portfolio dashboard with a public-safe synthetic Demo mode and a strictly read-only connected-mode boundary.

**Architecture:** Use an npm workspace with a Sites-compatible Vinext/App Router frontend in `apps/web`, a Fastify API plus durable worker entry point in `apps/server`, and shared financial contracts/calculations in `packages/domain`. Connected data is normalized into PostgreSQL through a closed Robinhood read adapter; Demo mode imports only synthetic fixtures and never initializes Robinhood, Clerk, PostgreSQL, email, or push credentials.

**Tech Stack:** Node.js >=22.13, npm workspaces, `@openai/create-sites@0.2.0`, Vinext 1.0.0-beta.5, React 19.2.6, TypeScript 5.9.3, Tailwind CSS 4.2.1, ECharts, Zod, Decimal.js, Fastify, Drizzle ORM, PostgreSQL, PGlite for integration tests, Clerk, Resend, Web Push, Vitest, React Testing Library, Playwright, axe-core, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-robinhood-portfolio-dashboard-design.md`

## Global Constraints

- Product name is `Aurum`; visual system is `Obsidian Gold`.
- The default view must answer total value and allocation within five seconds.
- Robinhood is server-only and read-only. No order, transfer, cancellation, exercise, watchlist mutation, scan mutation, or generic MCP proxy code may exist.
- Demo fixtures are invented and must not preserve the real account count, identifiers, symbols, values, dates, timestamps, or screenshots.
- Browser code may import `@aurum/domain` and typed API contracts; it may not import PostgreSQL, Robinhood, secret, or worker modules.
- Money crosses package/API boundaries as canonical decimal strings plus `USD`; calculations use Decimal.js, never JavaScript floating-point arithmetic.
- Store timestamps in UTC; display America/New_York with explicit source-as-of labels.
- Missing, stale, partial, unsupported, and disconnected values are distinct states; no unavailable field becomes zero.
- Screen Privacy Mode replaces rendered financial text with masks and is not an authorization boundary.
- Production configuration fails closed when auth, database, owner allowlist, or verified Robinhood read scopes are absent.
- Sites publishes only synthetic Demo mode in this implementation. Connected deployment uses the same frontend against the separately deployed HTTPS API.
- Use `apply_patch` for manual file edits, TDD for behavior, focused commits, and verification output before completion claims.

## Locked File Structure

```text
apps/
  web/
    .openai/hosting.json
    app/
      layout.tsx
      globals.css
      page.tsx
      loading.tsx
      error.tsx
      not-found.tsx
      accounts/page.tsx
      accounts/[accountId]/page.tsx
      holdings/page.tsx
      holdings/[securityId]/page.tsx
      performance/page.tsx
      analytics/page.tsx
      activity/page.tsx
      activity/imports/page.tsx
      activity/reconciliation/page.tsx
      alerts/page.tsx
      settings/page.tsx
      settings/security/page.tsx
      settings/notifications/page.tsx
      settings/data/page.tsx
      settings/connection/page.tsx
    components/{app-shell,overview,accounts,holdings,performance,analytics,activity,alerts,settings,states,ui}/
    lib/{api,demo,format,privacy}/
    tests/{unit,component,e2e}/
    public/og.png
  server/
    src/
      api.ts
      worker.ts
      app.ts
      config.ts
      auth/
      db/
      robinhood/
      sync/
      imports/
      alerts/
      notifications/
      routes/
    tests/{unit,contract,integration}/
packages/
  domain/
    src/{money,quality,provenance,accounts,observations,transactions,snapshots,metrics,alerts,api,index}.ts
    tests/
tests/fixtures/{imports,pdf}/
docs/{architecture,operations}/
.github/workflows/{ci,security}.yml
.env.example
Dockerfile
docker-compose.yml
package.json
tsconfig.base.json
vitest.workspace.ts
playwright.config.ts
```

---

### Task 1: Scaffold the workspace and test harness

**Files:**
- Create via generator: `apps/web/**`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `playwright.config.ts`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces npm workspaces named `@aurum/web`, `@aurum/server`, and `@aurum/domain`.
- Produces root commands `dev:web`, `dev:server`, `worker`, `typecheck`, `lint`, `test`, `test:e2e`, and `build`.

- [ ] **Step 1: Generate the Sites project as the first implementation action**

Run:

```powershell
npm create --yes @openai/sites@0.2.0 apps/web -- --yes --no-install
```

Expected: `apps/web/app/page.tsx`, `apps/web/vite.config.ts`, and `apps/web/.openai/hosting.json` exist; no second initializer is run.

- [ ] **Step 2: Add the root workspace and package manifests**

Create the root scripts with this contract:

```json
{
  "name": "aurum-portfolio-dashboard",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22.13.0" },
  "scripts": {
    "dev:web": "npm run dev --workspace @aurum/web",
    "dev:server": "npm run dev --workspace @aurum/server",
    "worker": "npm run worker --workspace @aurum/server",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "test": "vitest run --workspace vitest.workspace.ts",
    "test:e2e": "playwright test",
    "build": "npm run build --workspaces --if-present"
  }
}
```

Rename the scaffold package to `@aurum/web`; define `@aurum/server` and `@aurum/domain` as private ESM packages. Add `tsx`, `vitest`, `@playwright/test`, and `typescript` at the root. Preserve all scaffold-pinned versions.

- [ ] **Step 3: Configure TypeScript and test discovery**

`tsconfig.base.json` must enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and `moduleResolution: Bundler`. `vitest.workspace.ts` must include the domain, server, and web Vitest configs; Playwright must use `apps/web/tests/e2e` and start `npm run dev:web` on a deterministic local port.

- [ ] **Step 4: Install once from the workspace root**

Run:

```powershell
npm install
npm run typecheck
```

Expected: one root `package-lock.json`; type checking succeeds for the untouched scaffold and empty packages.

- [ ] **Step 5: Commit the scaffold**

```powershell
git add package.json package-lock.json tsconfig.base.json vitest.workspace.ts playwright.config.ts apps packages .gitignore
git commit -m "chore: scaffold Aurum workspace and test harness"
```

### Task 2: Deliver the first meaningful Obsidian Gold preview

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/components/app-shell/DashboardShell.tsx`
- Create: `apps/web/components/app-shell/DesktopSideRail.tsx`
- Create: `apps/web/components/app-shell/MobileTabBar.tsx`
- Create: `apps/web/components/app-shell/GlobalHeader.tsx`
- Create: `apps/web/components/app-shell/ScreenPrivacyToggle.tsx`
- Create: `apps/web/components/overview/OverviewScreen.tsx`
- Create: `apps/web/components/overview/PortfolioHero.tsx`
- Create: `apps/web/components/overview/PortfolioTrend.tsx`
- Create: `apps/web/components/overview/AllocationSummary.tsx`
- Create: `apps/web/components/overview/TopHoldings.tsx`
- Create: `apps/web/lib/demo/preview-fixture.ts`
- Create: `apps/web/lib/privacy/privacy-context.tsx`
- Test: `apps/web/tests/component/OverviewScreen.test.tsx`
- Test: `apps/web/tests/component/ScreenPrivacyToggle.test.tsx`

**Interfaces:**
- Produces `PreviewPortfolio` with `total`, `dailyChange`, `trend`, `allocation`, `topHoldings`, `asOf`, and `quality`.
- Produces `useScreenPrivacy(): { hidden: boolean; toggle(): void; mask(value: string): string }`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("shows the five-second answer with explicit Demo provenance", () => {
  render(<OverviewScreen portfolio={previewPortfolio} />);
  expect(screen.getByText("Synthetic Demo")).toBeVisible();
  expect(screen.getByRole("heading", { name: /portfolio value/i })).toBeVisible();
  expect(screen.getByText(/updated .* ET/i)).toBeVisible();
  expect(screen.getByText("Unsupported / residual")).toBeVisible();
});

it("replaces financial text when Screen Privacy Mode is enabled", async () => {
  render(<PreviewApp />);
  await userEvent.click(screen.getByRole("button", { name: /hide financial values/i }));
  expect(screen.queryByText("$128,640.25")).not.toBeInTheDocument();
  expect(screen.getAllByText("••••••").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm exec vitest run -- apps/web/tests/component/OverviewScreen.test.tsx apps/web/tests/component/ScreenPrivacyToggle.test.tsx`

Expected: failure because the screen, fixture, and privacy provider do not exist.

- [ ] **Step 3: Implement the bounded preview slice**

Create an invented three-account fixture with fictional securities and an explicit `Synthetic Demo` source. Build the first viewport in this order: total/source time, daily movement/completeness, trend, allocation including cash and residual, top five holdings, one factual insight. Implement desktop rail, mobile five-item bottom bar, 44 px controls, visible focus, reduced motion, tabular numerals, and distinct gold/amber/green/red/gray tokens.

The privacy helper must replace text:

```ts
export function maskFinancialValue(value: string, hidden: boolean): string {
  return hidden ? "••••••" : value;
}
```

- [ ] **Step 4: Start and retain the development server**

Run in a retained session: `npm run dev:web -- --host 127.0.0.1 --port 4173`

Make one non-browser request to `http://127.0.0.1:4173/`; require a 2xx response and successful compile. Then use the Sites/browser `open_in_codex` action once and retain that tab ID for the rest of the build. Do not inspect DOM or take screenshots.

- [ ] **Step 5: Run tests and commit the first preview**

Run:

```powershell
npm exec vitest run -- apps/web/tests/component/OverviewScreen.test.tsx apps/web/tests/component/ScreenPrivacyToggle.test.tsx
npm run typecheck
git add apps/web
git commit -m "feat: add Obsidian Gold portfolio preview"
```

Expected: tests and type checking pass; the user-facing preview is already recognizable as Aurum.

- [ ] **Step 6: Start the social-card generation in parallel**

After the preview handoff, invoke the `imagegen` skill and spawn exactly one image-only subagent with no conversation fork. Require one image-generation request for a 1200×630 Obsidian Gold landscape card with exact text `Aurum` and `Portfolio intelligence, without the noise`, no values or account data. It must save the result outside the Site checkout, return the path, and must not invoke Sites tools, edit source, initialize a project, or spawn another agent. Continue implementation while it runs.

### Task 3: Define shared financial contracts and calculations

**Files:**
- Create: `packages/domain/src/money.ts`
- Create: `packages/domain/src/quality.ts`
- Create: `packages/domain/src/provenance.ts`
- Create: `packages/domain/src/accounts.ts`
- Create: `packages/domain/src/observations.ts`
- Create: `packages/domain/src/transactions.ts`
- Create: `packages/domain/src/snapshots.ts`
- Create: `packages/domain/src/metrics.ts`
- Create: `packages/domain/src/alerts.ts`
- Create: `packages/domain/src/api.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/tests/{money,reconciliation,daily-change,allocation,valuation,pnl}.test.ts`

**Interfaces:**
- Produces `Money`, `Ratio`, `QualityState`, `Provenance`, `NormalizedTransaction`, `AccountSnapshot`, `PortfolioSnapshot`, `DashboardReadModel`, and alert contracts.
- Produces `reconcileAccount`, `calculateDailyChange`, `calculateAllocation`, `selectPositionValuation`, and `calculateUnrealizedPnl`.

- [ ] **Step 1: Write the failing money and reconciliation tests**

```ts
expect(addMoney(usd("0.10"), usd("0.20"))).toEqual(usd("0.30"));
expect(reconcileAccount({
  totalKind: "provider_portfolio_value",
  providerTotal: usd("100.00"),
  positions: usd("94.00"),
  cash: usd("5.00"),
  accrued: usd("0.00"),
  tolerance: usd("0.02"),
  residualKind: "unexplained"
})).toMatchObject({ residual: usd("1.00"), state: "unexplained_residual", headlineEligible: false });
```

- [ ] **Step 2: Run domain tests and confirm failure**

Run: `npm exec vitest run --project domain`

Expected: failure on missing exports.

- [ ] **Step 3: Implement canonical contracts**

Use these boundary shapes:

```ts
export type CurrencyCode = "USD";
export interface Money { amount: string; currency: CurrencyCode }
export interface Ratio { value: string }
export type QualityState = "complete" | "partial" | "stale" | "unsupported" | "invalid" | "reconciled" | "unavailable";
export type ReconciliationState = "reconciled" | "expected_unsupported_residual" | "timing_difference" | "unexplained_residual" | "not_computable";
```

Decimal.js performs arithmetic and every returned decimal string is normalized without exponent notation.

- [ ] **Step 4: Add fixture-driven metric tests**

Cover: the greater-of `$0.02`/`0.01%` tolerance; unknown total semantics; external deposit/withdrawal adjustments; dividends/internal transfers not treated as external flows; missing prior close; provider-value precedence; stale quote fallback rejection; cash/residual/unclassified allocation slices; missing cost basis returning unavailable.

- [ ] **Step 5: Run and commit**

```powershell
npm exec vitest run --project domain
npm run typecheck
git add packages/domain package.json package-lock.json
git commit -m "feat: add trustworthy portfolio domain calculations"
```

### Task 4: Add PostgreSQL persistence and the server foundation

**Files:**
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/api.ts`
- Create: `apps/server/src/worker.ts`
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/client.ts`
- Create: `apps/server/src/db/repositories.ts`
- Create: `apps/server/src/db/jobs.ts`
- Create: `apps/server/drizzle.config.ts`
- Create: `apps/server/drizzle/0000_initial.sql`
- Create: `apps/server/tests/integration/{schema,job-claim,snapshot-repository}.test.ts`
- Create: `.env.example`

**Interfaces:**
- Produces `createApi(config, dependencies): FastifyInstance`.
- Produces `PortfolioRepository`, `ImportRepository`, `AlertRepository`, `JobRepository`, and `AuditRepository` interfaces.
- Produces `JobRepository.enqueueUnique`, `claimNext`, `complete`, and `fail` with expiring leases.

- [ ] **Step 1: Write failing repository tests with PGlite**

```ts
it("lets only one worker claim a refresh job", async () => {
  await jobs.enqueueUnique({ userId: ownerId, kind: "portfolio_refresh", key: "refresh:owner" });
  const [a, b] = await Promise.all([jobs.claimNext("worker-a"), jobs.claimNext("worker-b")]);
  expect([a, b].filter(Boolean)).toHaveLength(1);
});

it("preserves the last-good snapshot after a failed run", async () => {
  const before = await snapshots.getCurrent(ownerId);
  await snapshots.recordFailedRun(ownerId, "provider_timeout");
  expect(await snapshots.getCurrent(ownerId)).toEqual(before);
});
```

- [ ] **Step 2: Run server integration tests and confirm failure**

Run: `npm exec vitest run --project server -- apps/server/tests/integration`

Expected: failure because schema and repositories do not exist.

- [ ] **Step 3: Implement schema and immutable repositories**

Create tables for users, accounts, securities, position/cash/quote observations, portfolio/account snapshots, transactions, import batches/rows, sync runs/jobs, benchmark observations, alert rules/events, notification deliveries, audit events, and recovery codes. Use PostgreSQL `numeric`, UTC timestamps, foreign keys, source IDs, provenance, quality, calculation version, and uniqueness rules from the spec. Repository APIs expose inserts and supersession; observation update/delete methods do not exist.

- [ ] **Step 4: Add strict environment parsing and production guards**

```ts
export const EnvironmentSchema = z.discriminatedUnion("APP_MODE", [
  z.object({ APP_MODE: z.literal("demo"), NODE_ENV: z.enum(["development", "test", "production"]) }),
  z.object({
    APP_MODE: z.literal("connected"),
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string().url(),
    OWNER_EMAIL: z.string().email(),
    CLERK_SECRET_KEY: z.string().min(20),
    ROBINHOOD_MCP_URL: z.string().url(),
    ROBINHOOD_READONLY_SCOPES: z.string().min(1)
  })
]);
```

Demo mode must not read live-provider keys. Connected mode rejects missing fields at startup.

- [ ] **Step 5: Generate, inspect, test, and commit the migration**

```powershell
npm run db:generate --workspace @aurum/server
npm exec vitest run --project server -- apps/server/tests/integration
npm run typecheck
git add apps/server .env.example package.json package-lock.json
git commit -m "feat: add immutable portfolio persistence and job coordination"
```

### Task 5: Implement the closed Robinhood read adapter and sync pipeline

**Files:**
- Create: `apps/server/src/robinhood/read-methods.ts`
- Create: `apps/server/src/robinhood/transport.ts`
- Create: `apps/server/src/robinhood/schemas.ts`
- Create: `apps/server/src/robinhood/mapper.ts`
- Create: `apps/server/src/robinhood/client.ts`
- Create: `apps/server/src/sync/schedule-policy.ts`
- Create: `apps/server/src/sync/refresh-service.ts`
- Create: `apps/server/src/sync/snapshot-promotion.ts`
- Create: `apps/server/src/sync/worker-loop.ts`
- Test: `apps/server/tests/contract/robinhood-read-client.test.ts`
- Test: `apps/server/tests/integration/refresh-service.test.ts`

**Interfaces:**
- Consumes domain observations/snapshots and persistence repositories.
- Produces `RobinhoodReadClient.readAccounts`, `readPortfolio`, `readEquityPositions`, `readEquityQuotes`, `readOptionPositions`, `readOrders`, and `readRealizedPnl`.
- Produces `RefreshService.request`, `runNext`, and `disconnect`.

- [ ] **Step 1: Write the closed-boundary contract tests**

```ts
expect(allowedRobinhoodTools).toEqual([
  "mcp__robinhood__get_accounts",
  "mcp__robinhood__get_portfolio",
  "mcp__robinhood__get_equity_positions",
  "mcp__robinhood__get_equity_quotes",
  "mcp__robinhood__get_option_positions",
  "mcp__robinhood__get_equity_orders",
  "mcp__robinhood__get_option_orders",
  "mcp__robinhood__get_equity_tax_lots",
  "mcp__robinhood__get_realized_pnl",
  "mcp__robinhood__get_pnl_trade_history"
]);
expect(() => assertAllowedRobinhoodTool("mcp__robinhood__place_equity_order")).toThrow(/read-only/i);
expect(() => assertAllowedRobinhoodTool("mcp__robinhood__cancel_option_order")).toThrow(/read-only/i);
```

Also assert that HTTP route schemas contain no `tool`, `toolName`, `method`, `arguments`, account number, or credential field.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `npm exec vitest run --project server -- apps/server/tests/contract/robinhood-read-client.test.ts`

Expected: failure on the missing allowlist and client.

- [ ] **Step 3: Implement an internal-only MCP transport**

```ts
export interface McpTransport {
  call<T>(tool: AllowedRobinhoodTool, args: Readonly<Record<string, unknown>>): Promise<T>;
}

export class RobinhoodReadClient {
  constructor(private readonly transport: McpTransport) {}
  readAccounts(): Promise<readonly AccountObservation[]>;
  readPortfolio(accountRef: EncryptedAccountReference): Promise<AccountValueObservation>;
}
```

The public API never receives `AllowedRobinhoodTool`. Validate all provider payloads with strict Zod schemas, mask account numbers at the mapper boundary, keep encrypted provider references server-side, and map absent values to unavailable.

- [ ] **Step 4: Implement coherent refresh and promotion**

One sync run reads accounts, each included portfolio, supported position sets, and quotes. Promotion requires one included account observation per run and at most 120 seconds source skew. Manual, page-load, heartbeat, and scheduled requests share `refresh:{userId}` idempotency. Failed/partial runs preserve last-good data.

- [ ] **Step 5: Implement the schedule policy**

Tests must prove: 60-second interactive eligibility during regular sessions; 15-minute background schedule during regular sessions; hourly off-hours; daily regular-close/next-available snapshot; one off-hours checkpoint; holidays and half-days; 30-day intraday pruning; database lease and retry/backoff/circuit-breaker behavior.

- [ ] **Step 6: Run and commit**

```powershell
npm exec vitest run --project server -- apps/server/tests/contract apps/server/tests/integration/refresh-service.test.ts
npm run typecheck
git add apps/server packages/domain package.json package-lock.json
git commit -m "feat: add read-only Robinhood sync pipeline"
```

### Task 6: Create the typed dashboard API and data-source switching

**Files:**
- Create: `apps/server/src/routes/dashboard.ts`
- Create: `apps/server/src/routes/accounts.ts`
- Create: `apps/server/src/routes/holdings.ts`
- Create: `apps/server/src/routes/performance.ts`
- Create: `apps/server/src/routes/activity.ts`
- Create: `apps/server/src/routes/alerts.ts`
- Create: `apps/server/src/routes/refresh.ts`
- Create: `apps/server/src/routes/health.ts`
- Create: `apps/server/src/routes/errors.ts`
- Create: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/api/data-source.ts`
- Create: `apps/web/lib/demo/dashboard-fixture.ts`
- Create: `apps/web/lib/demo/state-fixtures.ts`
- Test: `apps/server/tests/integration/dashboard-routes.test.ts`
- Test: `apps/web/tests/unit/data-source.test.ts`

**Interfaces:**
- Produces versioned `/v1/dashboard`, `/v1/accounts`, `/v1/holdings`, `/v1/performance`, `/v1/activity`, `/v1/alerts`, `/v1/refresh`, and `/health` endpoints.
- Produces `PortfolioDataSource` with matching methods and `DemoPortfolioDataSource`/`ApiPortfolioDataSource` implementations.

- [ ] **Step 1: Write failing API and mode-isolation tests**

```ts
it("returns last-good data with freshness and coverage", async () => {
  const response = await app.inject({ method: "GET", url: "/v1/dashboard" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ mode: "connected", asOf: expect.any(String), coverage: expect.any(Object) });
});

it("never initializes the network client in Demo mode", async () => {
  const transport = vi.fn(() => { throw new Error("network initialized"); });
  const source = createPortfolioDataSource({ mode: "demo", transport });
  await expect(source.getDashboard()).resolves.toMatchObject({ mode: "demo" });
  expect(transport).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm exec vitest run --project server -- apps/server/tests/integration/dashboard-routes.test.ts && npm exec vitest run --project web -- apps/web/tests/unit/data-source.test.ts`

Expected: failure on missing routes and data sources.

- [ ] **Step 3: Implement one shared read model**

`DashboardReadModel` contains hero metrics, trend, account allocation, asset allocation, top holdings, insight, `asOf`, `coverage`, `freshness`, `reconciliationStatus`, `calculationVersion`, `mode`, and channel/connection capabilities. All pages reuse it or typed sub-models; no UI formula recalculates financial values.

- [ ] **Step 4: Implement safe API behavior**

Validate request/response schemas, return stable error codes, add ETags to GET routes, coalesce refresh POSTs, rate-limit mutations, and configure exact-origin CORS. `/health` distinguishes API readiness, database readiness, worker freshness, and provider connection without revealing secrets.

- [ ] **Step 5: Run and commit**

```powershell
npm exec vitest run --project server -- apps/server/tests/integration/dashboard-routes.test.ts
npm exec vitest run --project web -- apps/web/tests/unit/data-source.test.ts
npm run typecheck
git add apps/server apps/web packages/domain
git commit -m "feat: expose typed portfolio read models"
```

### Task 7: Complete the responsive shell, Accounts, and Holdings

**Files:**
- Create/modify: `apps/web/components/app-shell/**`
- Create: `apps/web/components/ui/{Button,Card,Badge,IconButton,SegmentedControl,Select,Table,Tooltip,VisuallyHidden}.tsx`
- Create: `apps/web/components/states/{DashboardSkeleton,RefreshingIndicator,StaleDataNotice,PartialDataNotice,UnsupportedDataNotice,SourceErrorNotice,EmptyPortfolioState,DisconnectedState}.tsx`
- Create: `apps/web/components/accounts/{AccountsScreen,AccountSummaryCard,AccountDetailScreen,AccountHoldingsTable}.tsx`
- Create: `apps/web/components/holdings/{HoldingsScreen,HoldingsTable,HoldingMobileCard,HoldingDetailScreen,HoldingAccountDistribution}.tsx`
- Create/modify: `apps/web/app/accounts/**`
- Create/modify: `apps/web/app/holdings/**`
- Test: `apps/web/tests/component/{DashboardShell,AccountsScreen,HoldingsScreen,OperationalStates}.test.tsx`
- Test: `apps/web/tests/e2e/responsive-navigation.spec.ts`

**Interfaces:**
- Consumes only `PortfolioDataSource` read models.
- Produces keyboard/touch navigation and URL-backed sorting/filtering.

- [ ] **Step 1: Write failing responsive and state tests**

Assert desktop navigation labels; mobile bottom navigation has exactly Overview, Holdings, Activity, Alerts, More; More exposes Accounts, Performance, Analytics, Settings; refreshing keeps values; stale explains reason; partial scopes affected metrics; disconnected retains imported history; unsupported displays its own category.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm exec vitest run --project web -- apps/web/tests/component && npm run test:e2e -- --grep "responsive navigation"`

Expected: failure on missing screens/routes.

- [ ] **Step 3: Implement routes and components**

Use semantic headings/tables, sticky identifiers where horizontal comparison is necessary, URL query parameters for sort/filter, stable back links on detail pages, session-local Screen Privacy Mode, and `aria-live="polite"` for refresh status. Closed zero-balance accounts are visible but excluded from current denominators; non-zero closed accounts carry an inclusion badge.

- [ ] **Step 4: Verify 360, 768, and 1440 widths in Playwright**

Assert no page-level horizontal overflow, 44 px controls, first-viewport hero/freshness visibility, persistent desktop rail, two-column tablet reflow, and usable mobile cards.

- [ ] **Step 5: Commit**

```powershell
npm exec vitest run --project web -- apps/web/tests/component
npm run test:e2e -- --grep "responsive navigation"
git add apps/web
git commit -m "feat: add responsive accounts and holdings experience"
```

### Task 8: Add accessible Performance, Analytics, and Activity views

**Files:**
- Create: `apps/web/components/charts/AccessibleChart.tsx`
- Create: `apps/web/components/charts/ChartDataTable.tsx`
- Create: `apps/web/components/performance/{PerformanceScreen,PortfolioValueChart,PerformanceCoverageNotice,ExternalFlowMarkers}.tsx`
- Create: `apps/web/components/analytics/{AnalyticsScreen,ConcentrationCard,AllocationBreakdown,DataQualityNotice}.tsx`
- Create: `apps/web/components/activity/{ActivityScreen,ActivityTimeline,ReconciliationScreen}.tsx`
- Create: `apps/server/src/benchmark/{polygon-client,eligibility}.ts`
- Modify: `apps/web/app/performance/page.tsx`
- Modify: `apps/web/app/analytics/page.tsx`
- Modify: `apps/web/app/activity/page.tsx`
- Modify: `apps/web/app/activity/reconciliation/page.tsx`
- Test: `apps/web/tests/component/{AccessibleChart,PerformanceScreen,AnalyticsScreen,ActivityScreen}.test.tsx`
- Test: `apps/server/tests/unit/benchmark-eligibility.test.ts`

**Interfaces:**
- Produces an `AccessibleChart` whose visual series and semantic table share one data array.
- Produces value-change displays that never call incomplete series investment returns.

- [ ] **Step 1: Write failing chart and semantics tests**

```tsx
expect(screen.getByRole("table", { name: /portfolio value data/i })).toBeInTheDocument();
expect(screen.getByText(/portfolio value change/i)).toBeVisible();
expect(screen.queryByText(/^investment return$/i)).not.toBeInTheDocument();
```

Also assert keyboard point navigation, reduced-motion behavior, cash/residual allocation categories, concentration scope, activity source labels, and reconciliation evidence.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm exec vitest run --project web -- apps/web/tests/component/AccessibleChart.test.tsx apps/web/tests/component/PerformanceScreen.test.tsx apps/web/tests/component/AnalyticsScreen.test.tsx apps/web/tests/component/ActivityScreen.test.tsx`

- [ ] **Step 3: Implement ECharts through one client boundary**

Load ECharts only in a client component. Use gold for selection, green/red only for direction, patterns/icons/text for quality, and a synchronized table/download summary. Benchmark comparison renders only when the API read model says `eligible`; price-only benchmarks render as a separate price series without comparative-return language.

Add the optional Polygon adapter server-side. It validates adjusted-close data, USD currency, aligned sessions, coverage, and missing dates before returning `eligible`; absent credentials return a typed unavailable reason and do not fail the portfolio view.

- [ ] **Step 4: Run and commit**

```powershell
npm exec vitest run --project web -- apps/web/tests/component
npm run typecheck
git add apps/web package.json package-lock.json
git commit -m "feat: add accessible performance and analytics views"
```

### Task 9: Implement safe CSV/PDF import preview and confirmation

**Files:**
- Create: `apps/server/src/imports/{contracts,detect-format,parse-csv,parse-statement,normalize-transaction,fingerprint,deduplicate,preview-import,confirm-import,evidence-store}.ts`
- Create: `apps/server/src/imports/{s3-evidence-store,memory-evidence-store}.ts`
- Create: `apps/server/src/routes/imports.ts`
- Create: `apps/web/components/activity/{ImportScreen,ImportDropzone,ImportPreviewTable,ImportErrorList}.tsx`
- Modify: `apps/web/app/activity/imports/page.tsx`
- Create: `tests/fixtures/imports/{activity-valid,activity-duplicate,activity-ambiguous,activity-malformed,activity-formula-injection}.csv`
- Create: `apps/server/tests/unit/imports/{parse-csv,deduplicate}.test.ts`
- Create: `apps/server/tests/integration/import-flow.test.ts`
- Create: `apps/web/tests/e2e/import-preview.spec.ts`

**Interfaces:**
- Produces `previewImport(input, dependencies): Promise<ImportPreview>`.
- Produces `confirmImport(confirmation, dependencies): Promise<ImportResult>`.
- Produces `EvidenceStore.putEncrypted`, `delete`, and `markNonReproducible`.

- [ ] **Step 1: Write failing parser and dedupe tests**

```ts
expect(await previewImport(validCsv, deps)).toMatchObject({ acceptedRows: 5, duplicateRows: 0, ambiguousRows: 0 });
expect(() => parseCsv(formulaInjectionCsv)).toThrow(/unsafe spreadsheet formula/i);
expect(decideTransactionDeduplication(candidate, exactExisting).decision).toBe("duplicate");
expect(decideTransactionDeduplication(candidate, nearMatchExisting).decision).toBe("review_required");
```

Test unique `(source, account, sourceTransactionId)`, same-file checksum idempotency, distinct source IDs, malformed money, large file/row limits, unknown event types, and partial batches.

- [ ] **Step 2: Run import tests and confirm failure**

Run: `npm exec vitest run --project server -- apps/server/tests/unit/imports apps/server/tests/integration/import-flow.test.ts`

- [ ] **Step 3: Implement bounded parsing and evidence retention**

Accept only `text/csv` and `application/pdf`; validate magic bytes, media type, extension, size, row/page limits, and formula prefixes. CSV rows normalize into immutable transactions with parser/mapping version and source lineage. PDF text extraction creates review-required drafts with page/line references; it never auto-confirms ambiguous statement entries.

Encrypt the original or canonical raw rows for 90 days. Immediate owner deletion removes evidence and marks the batch `non_reproducible` while retaining normalized facts, checksum, versions, and reconciliation result.

`S3EvidenceStore` uses a private bucket, server-side encryption, non-guessable object keys, content hashes, and no public URLs. `MemoryEvidenceStore` exists only for tests. Connected production refuses file import when the durable encrypted evidence store is unavailable.

- [ ] **Step 4: Implement the three-step import UI**

Drop/select → preview mappings/errors/conflicts → confirm selected records. Preserve progress on errors, expose row/page messages, provide an error-report download, and never send file bytes to Demo mode unless the user explicitly selects a local synthetic fixture.

- [ ] **Step 5: Run and commit**

```powershell
npm exec vitest run --project server -- apps/server/tests/unit/imports apps/server/tests/integration/import-flow.test.ts
npm run test:e2e -- --grep "import preview"
npm run typecheck
git add apps/server apps/web tests package.json package-lock.json
git commit -m "feat: add auditable portfolio history imports"
```

### Task 10: Implement factual alerts and notification channels

**Files:**
- Create: `apps/server/src/alerts/{contracts,evaluate-rule,delivery-policy,evidence,service}.ts`
- Create: `apps/server/src/notifications/{in-app,resend-email,web-push}.ts`
- Create: `apps/web/components/alerts/{AlertsScreen,AlertInbox,AlertRuleForm,AlertEvidence,DeliveryChannelStatus}.tsx`
- Modify: `apps/web/app/alerts/page.tsx`
- Test: `apps/server/tests/unit/alerts/{evaluate-rule,delivery-policy}.test.ts`
- Test: `apps/server/tests/integration/notification-delivery.test.ts`
- Test: `apps/web/tests/e2e/alerts.spec.ts`

**Interfaces:**
- Produces `evaluateAlertRule(rule, context): AlertEvaluation`.
- Produces `decideDelivery(evaluation, history, nowUtc): DeliveryDecision`.
- Produces `NotificationAdapter.send(event): Promise<DeliveryResult>`.

- [ ] **Step 1: Write failing alert-policy tests**

Cover data-health, stale sync, portfolio/holding move, value, concentration, and cash rules. Assert named baselines, hysteresis, cooldown, daily caps, pending second-observation confirmation, and suppression for stale/partial/unreconciled/mixed-market/unsupported-dominant snapshots.

```ts
expect(evaluateAlertRule(moveRule, staleContext).state).toBe("suppressed");
expect(evaluateAlertRule(moveRule, firstOutlierContext).state).toBe("breach_pending_confirmation");
expect(decideDelivery(confirmed, deliveredWithinCooldown, now).deliver).toBe(false);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm exec vitest run --project server -- apps/server/tests/unit/alerts apps/server/tests/integration/notification-delivery.test.ts`

- [ ] **Step 3: Implement evaluation and evidence**

Persist baseline/current snapshot IDs, source time, current/baseline value, external-flow adjustment, quality, calculation version, threshold, and delivery reason. In-app delivery always works. Resend and VAPID adapters activate only when configured and send sparse content without balances/account identifiers by default.

- [ ] **Step 4: Implement the Alerts UI**

Support inbox read/unread, mute/snooze, rule create/edit, channel status, evidence links, and explicit unavailable-channel messages. Do not include trading suggestions, forecasts, or advice language.

- [ ] **Step 5: Run and commit**

```powershell
npm exec vitest run --project server -- apps/server/tests/unit/alerts apps/server/tests/integration/notification-delivery.test.ts
npm run test:e2e -- --grep "alerts"
git add apps/server apps/web package.json package-lock.json
git commit -m "feat: add evidence-backed portfolio alerts"
```

### Task 11: Add connected-mode identity, recovery, security, and Settings

**Files:**
- Create: `apps/server/src/auth/{clerk-verifier,authorize-owner,recovery-codes,sessions}.ts`
- Create: `apps/server/src/security/{headers,csrf,rate-limit,redaction}.ts`
- Create: `apps/server/src/routes/{auth,settings,export,delete}.ts`
- Create: `apps/web/components/settings/{SettingsScreen,PasskeySettings,RecoveryCodeSettings,NotificationSettings,DataControls,ConnectionHealth}.tsx`
- Create/modify: `apps/web/app/settings/**`
- Test: `apps/server/tests/unit/auth/{authorize-owner,recovery-codes}.test.ts`
- Test: `apps/server/tests/unit/security/redaction.test.ts`
- Test: `apps/server/tests/integration/auth-routes.test.ts`
- Test: `apps/web/tests/component/SettingsScreen.test.tsx`

**Interfaces:**
- Produces `AuthenticatedPrincipal { clerkUserId, email, emailVerified: true }`.
- Produces `authorizeOwner(principal, allowlist): OwnerPrincipal`.
- Produces one-time recovery-code create/consume operations and a restricted recovery session.

- [ ] **Step 1: Verify current Clerk passkey and server-token APIs from official documentation**

Record the chosen package/API links in `docs/architecture/authentication.md`. Production must disable public sign-up, pre-provision one principal, require passkey daily auth, and enforce both exact Clerk user ID and normalized verified email on the server.

- [ ] **Step 2: Write failing authorization and recovery tests**

```ts
expect(() => authorizeOwner({ clerkUserId: ownerId, email: ownerEmail, emailVerified: true }, allowlist)).not.toThrow();
expect(() => authorizeOwner({ clerkUserId: "other", email: ownerEmail, emailVerified: true }, allowlist)).toThrow();
expect(() => authorizeOwner({ clerkUserId: ownerId, email: ownerEmail, emailVerified: false }, allowlist)).toThrow();
```

Assert recovery requires a valid single-use code plus verified-email proof, grants only passkey re-enrollment, consumes atomically, and revokes existing sessions.

- [ ] **Step 3: Implement fail-closed identity and API security**

Demo mode renders a public synthetic app and never loads Clerk. Connected mode validates Clerk tokens server-side, applies owner allowlist, exact-origin CORS, CSRF on cookie-authenticated writes, secure cookie settings, rate limits, CSP/security headers, and structured redaction. If Clerk cannot support the dual-proof recovery contract, disable recovery enrollment and report the security gate rather than allow email-only access.

- [ ] **Step 4: Implement Settings and data controls**

Show connection/read-scope health, passkeys, recovery-code regeneration, notification capability, Screen Privacy Mode description, retention, export, and destructive deletion previews. Account identifiers stay masked. Deletion describes backup-retention expiry and requires an exact typed confirmation.

- [ ] **Step 5: Run and commit**

```powershell
npm exec vitest run --project server -- apps/server/tests/unit/auth apps/server/tests/unit/security apps/server/tests/integration/auth-routes.test.ts
npm exec vitest run --project web -- apps/web/tests/component/SettingsScreen.test.tsx
npm run typecheck
git add apps/server apps/web docs/architecture package.json package-lock.json
git commit -m "feat: secure connected mode and owner controls"
```

### Task 12: Add operations, containers, CI, and public documentation

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/security.yml`
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `docs/architecture/live-data-boundary.md`
- Create: `docs/operations/{deployment,backup-restore,disconnect-runbook}.md`
- Create: `apps/server/tests/integration/health.test.ts`
- Modify: `apps/web/app/layout.tsx`
- Create from image result: `apps/web/public/og.png`

**Interfaces:**
- Produces one Docker image with `api`, `worker`, and `migrate` commands.
- Produces CI gates for lint, typecheck, unit/contract/integration tests, production builds, dependency audit, and secret/history scans.

- [ ] **Step 1: Inspect and integrate the approved social-preview image**

Inspect the bitmap returned by the Task 2 image subagent. Retry once only if the required text is incorrect or unreadable. Save the accepted bitmap as `apps/web/public/og.png` and configure absolute Open Graph/X metadata from a trusted deployment origin. Remove the scaffold SVG favicon rather than shipping a generic or model-authored vector mark.

- [ ] **Step 2: Write failing operational tests**

Test health states for database ready, worker stalled, and provider disconnected; log redaction for tokens/cookies/account identifiers/raw payloads; production config rejecting Demo bypass; Docker commands starting without embedding secrets.

- [ ] **Step 3: Implement container and operational boundaries**

Use a multi-stage non-root Node image. `api` exposes HTTPS-behind-proxy health/readiness; `worker` polls leased PostgreSQL jobs; `migrate` runs Drizzle SQL. Compose starts PostgreSQL plus separate API/worker services for local connected-mode testing. Document live MCP/OAuth proof as a prerequisite and never suggest exporting the Codex connector.

- [ ] **Step 4: Implement least-privilege CI and documentation**

GitHub Actions use read-only source permissions except where checkout requires, never expose production secrets to pull requests/forks, run `npm audit --audit-level=high`, run a secret scanner, and scan reachable history. README leads with Demo vs Connected modes, setup, screenshots-free synthetic preview, read-only guarantee, environment contract, and independent/not-affiliated disclaimer.

- [ ] **Step 5: Run and commit**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
docker build -t aurum-portfolio:local .
git add Dockerfile docker-compose.yml .dockerignore .github README.md SECURITY.md docs apps/web/app/layout.tsx apps/web/public/og.png apps/server/tests
git commit -m "chore: add secure delivery and operations"
```

### Task 13: Run acceptance QA, publish Demo mode, and push GitHub

**Files:**
- Create/modify: `apps/web/tests/e2e/{overview,responsive-navigation,accessibility,operational-states,import-preview,alerts}.spec.ts`
- Modify only for verified failures: implementation files identified by tests
- Create: `docs/operations/verification-report.md`

**Interfaces:**
- Consumes the entire spec and all prior task outputs.
- Produces a verified Git commit, GitHub `main`, a saved Sites version, and a Demo deployment URL.

- [ ] **Step 1: Write/complete the acceptance E2E suite**

Cover 360×800, 768×1024, and 1440×900; no horizontal page overflow; first viewport hero/freshness/trend/allocation; keyboard order and visible focus; axe checks; privacy masking; retained last-good values; stale/partial/disconnected/unsupported states; route return behavior; import preview/conflicts; alert evidence; and synthetic-only metadata.

- [ ] **Step 2: Run the full verification matrix from a clean process**

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit --audit-level=high
docker build -t aurum-portfolio:verify .
git diff --check
git status --short
```

Expected: every command exits 0; only intentional tracked changes remain. Record exact commands, versions, results, Demo limitations, and live-connection prerequisite in `docs/operations/verification-report.md`.

- [ ] **Step 3: Review the public tree and reachable history**

Search for `.env`, keys/tokens, full account identifiers, real balances, prior real timestamps, private exports/imports, screenshots, and Robinhood write verbs in application code. Confirm synthetic fixtures are visibly labeled and different from the real portfolio. Commit the verification report and any evidence-safe fixes.

- [ ] **Step 4: Push the exact verified source state**

```powershell
git status --short --branch
git log --oneline --decorate -12
git push --set-upstream origin main
git rev-parse HEAD
```

Expected: GitHub `ChacoBee/Robinhood-Portfolios-Management` `main` points to the verified SHA.

- [ ] **Step 5: Save and deploy the Sites Demo version**

Read `apps/web/.openai/hosting.json`; create the Site once only if `project_id` is absent. Build the source archive from the exact pushed SHA, save a version using that SHA, deploy only the saved version, and poll deployment status when non-terminal. Keep Demo mode synthetic and public-safe; use Sites access policy only if the user later requests a private preview.

- [ ] **Step 6: Final completion review**

Invoke `superpowers:verification-before-completion`, confirm the GitHub commit and Sites URL, stop the retained development server, and report: delivered features, verification summary, repo URL/SHA, Demo URL, and the one external prerequisite for live Robinhood—separately provisioned application-side read-only MCP/OAuth credentials.
