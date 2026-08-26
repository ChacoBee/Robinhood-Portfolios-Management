# Robinhood Live Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enroll the single owner with Robinhood OAuth, sync all account portfolios through an SDK-backed read-only MCP adapter, and serve connected snapshots behind Clerk authentication.

**Architecture:** A one-shot Docker operator command performs DCR + PKCE and stores encrypted OAuth material in PostgreSQL. The worker uses the official Streamable HTTP MCP client with a closed tool allowlist, normalizes real Robinhood payloads, and promotes last-good snapshots. The web app uses Clerk React while the API verifies the exact owner with Clerk Backend.

**Tech Stack:** TypeScript 5.9, Node 24, `@modelcontextprotocol/client` 2.0, `@clerk/backend`, `@clerk/react`, Fastify 5, Drizzle/PostgreSQL 17, Vinext/React 19, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-25-robinhood-live-connection-design.md`

## Global Constraints

- Robinhood MCP is pinned to `https://agent.robinhood.com/mcp/trading`.
- OAuth issuer/resource is the same pinned endpoint; scope is exactly `internal`.
- Only `get_accounts`, `get_portfolio`, `get_equity_positions`, `get_equity_quotes`, `get_option_positions`, `get_option_quotes`, and `get_option_instruments` may cross the MCP boundary.
- Browser and API logs never receive Robinhood tokens, authorization codes, raw account numbers, or provider payloads.
- OAuth secrets and account references use separate AES-256-GCM keys.
- Production and non-loopback origins require exact HTTPS; development may use exact HTTP loopback origins.
- Provider totals remain authoritative and last-good snapshots survive failed refreshes.
- Every behavior change follows red-green-refactor.

---

### Task 1: Real Robinhood contract and valuation

**Files:**
- Modify: `apps/server/src/robinhood/read-methods.ts`
- Modify: `apps/server/src/robinhood/schemas.ts`
- Modify: `apps/server/src/robinhood/client.ts`
- Modify: `apps/server/src/robinhood/mapper.ts`
- Modify: `apps/server/src/sync/refresh-service.ts`
- Test: `apps/server/tests/contract/robinhood-read-client.test.ts`
- Test: `apps/server/tests/integration/refresh-service.test.ts`

**Interfaces:**
- Consumes: `McpTransport.call(tool, args)` and `AccountReferenceVault`.
- Produces: real-payload `RobinhoodReadClient` methods returning existing observation types, plus valued equity/option positions before snapshot promotion.

- [ ] **Step 1: Replace synthetic fixtures with sanitized real-shape fixtures**

Add tests using `account_number`, `total_value`, `positions[].symbol`, `results[].quote`, pagination `next`, and nullable rows. Assert arguments use `account_number`, option reads use `nonzero: true`, pages are exhausted once, and a repeated cursor throws `provider_schema_drift`.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `npm test -- apps/server/tests/contract/robinhood-read-client.test.ts`

Expected: failures showing `account_id` assumptions and missing real quote valuation.

- [ ] **Step 3: Implement strict real payload schemas and mapping**

Define raw schemas that accept only documented provider fields required by Aurum while permitting documented optional fields. Map `account_number` into the vault, nickname/type into display name, state flags into status, and portfolio totals into `provider_portfolio_value`. Stamp payloads without provider timestamps using an injected `now()` receipt time.

Value equities as:

```ts
marketValue = new Decimal(quantity).mul(currentQuotePrice)
costBasis = averageBuyPrice
  ? new Decimal(quantity).mul(averageBuyPrice)
  : null
```

Value options as:

```ts
marketValue = new Decimal(quantity)
  .mul(markPrice)
  .mul(tradeValueMultiplier)
```

Use the more recent valid equity regular/non-regular trade timestamp. Reject missing, untraded, duplicate, unrequested, non-USD, or non-finite valuation inputs.

- [ ] **Step 4: Update refresh orchestration**

Make quote valuation happen before `buildSnapshotPromotion()`. Preserve the existing observation interfaces so repository persistence remains unchanged. Batch equity symbols and option IDs in groups of 20.

- [ ] **Step 5: Run focused and integration tests GREEN**

Run: `npm test -- apps/server/tests/contract/robinhood-read-client.test.ts apps/server/tests/integration/refresh-service.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/robinhood apps/server/src/sync/refresh-service.ts apps/server/tests/contract/robinhood-read-client.test.ts apps/server/tests/integration/refresh-service.test.ts
git commit -m "feat: normalize live Robinhood portfolio payloads"
```

### Task 2: Official MCP SDK transport and closed tool boundary

**Files:**
- Modify: `apps/server/package.json`
- Modify: `package-lock.json`
- Modify: `apps/server/src/robinhood/transport.ts`
- Modify: `apps/server/src/robinhood/read-methods.ts`
- Test: `apps/server/tests/unit/transport.test.ts`
- Test: `apps/server/tests/unit/provider-boundary.test.ts`

**Interfaces:**
- Consumes: an injected `McpClientFactory` in tests and an OAuth-compatible `AuthProvider` at runtime.
- Produces: `SdkMcpTransport implements McpTransport` with `connect()`, `call()`, and `close()`.

- [ ] **Step 1: Add failing boundary and lifecycle tests**

Assert the transport initializes before its first call, converts wrapper names to raw tool names, unwraps only `structuredContent.data`, reuses the connection, closes cleanly, applies a 15-second timeout, rejects write tool names before client creation, pins the exact endpoint, and redacts SDK error content.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- apps/server/tests/unit/transport.test.ts apps/server/tests/unit/provider-boundary.test.ts`

Expected: failures because the hand-written JSON-RPC transport has no SDK lifecycle.

- [ ] **Step 3: Install the SDK**

Run: `npm install --workspace @aurum/server @modelcontextprotocol/client@2.0.0`

- [ ] **Step 4: Implement the SDK adapter**

Construct `Client({ name: 'aurum-portfolio', version: '0.1.0' })` and `StreamableHTTPClientTransport` with the injected auth provider. Call `client.connect()`, `client.listTools()` once, require every allowlisted raw read tool to be advertised, then invoke `client.callTool({ name, arguments: args })`. Do not expose `Client` or a string-based call method outside the typed transport.

- [ ] **Step 5: Run tests GREEN and typecheck**

Run: `npm test -- apps/server/tests/unit/transport.test.ts apps/server/tests/unit/provider-boundary.test.ts && npm run typecheck`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/server/package.json apps/server/src/robinhood apps/server/tests/unit/transport.test.ts apps/server/tests/unit/provider-boundary.test.ts
git commit -m "feat: use official MCP client transport"
```

### Task 3: Encrypted OAuth credential repository

**Files:**
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/db/repositories.ts`
- Create: `apps/server/src/robinhood/oauth-crypto.ts`
- Create: `apps/server/src/robinhood/oauth-store.ts`
- Create: `apps/server/drizzle/0003_robinhood_oauth.sql`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Test: `apps/server/tests/unit/oauth-crypto.test.ts`
- Test: `apps/server/tests/integration/oauth-store.test.ts`
- Test: `apps/server/tests/unit/config.test.ts`

**Interfaces:**
- Produces: `RobinhoodOAuthStore.load()`, `saveClientInformation()`, `saveTokens()`, `markHeartbeat()`, and `disconnect()`; stored JSON is encrypted at rest.

- [ ] **Step 1: Write crypto and repository tests**

Assert AES-GCM round trips, random nonces produce different envelopes, tampering fails with a safe code, plaintext tokens never appear in stored rows, token rotation is atomic, and disconnect removes the credential row. Add config tests requiring a base64 32-byte `ROBINHOOD_OAUTH_ENCRYPTION_KEY` only in connected mode.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- apps/server/tests/unit/oauth-crypto.test.ts apps/server/tests/integration/oauth-store.test.ts apps/server/tests/unit/config.test.ts`

Expected: missing modules/schema failures.

- [ ] **Step 3: Implement crypto, schema, migration, and store**

Create one row per owner/provider with encrypted client-information JSON, encrypted token JSON, connection state, token update time, heartbeat time, and audit timestamps. Bind AES-GCM additional authenticated data to `ownerId + provider + recordKind` so ciphertext cannot be moved between rows.

- [ ] **Step 4: Run migration checks and tests GREEN**

Run: `npm run db:check --workspace @aurum/server && npm test -- apps/server/tests/unit/oauth-crypto.test.ts apps/server/tests/integration/oauth-store.test.ts apps/server/tests/unit/config.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/db apps/server/src/robinhood/oauth-crypto.ts apps/server/src/robinhood/oauth-store.ts apps/server/drizzle apps/server/tests
git commit -m "feat: persist encrypted Robinhood OAuth grants"
```

### Task 4: OAuth provider and enrollment command

**Files:**
- Create: `apps/server/src/robinhood/oauth-provider.ts`
- Create: `apps/server/src/robinhood/connect-cli.ts`
- Modify: `apps/server/package.json`
- Modify: `docker-entrypoint.sh`
- Test: `apps/server/tests/unit/oauth-provider.test.ts`
- Test: `apps/server/tests/integration/connect-cli.test.ts`

**Interfaces:**
- Consumes: MCP SDK `OAuthClientProvider`, `RobinhoodOAuthStore`, pinned metadata, and callback port `43117`.
- Produces: SDK-compatible persistent OAuth provider and `connectRobinhood()` operator flow.

- [ ] **Step 1: Write failing OAuth state-machine tests**

Assert DCR metadata uses `application_type: 'native'`, exact callback `http://127.0.0.1:43117/callback`, authorization-code + refresh-token grants, scope `internal`, and token auth method `none`. Assert random state is single-use, callback state/issuer mismatches fail, callback binds loopback only, rotated tokens persist, and logs never contain codes or tokens.

- [ ] **Step 2: Run tests RED**

Run: `npm test -- apps/server/tests/unit/oauth-provider.test.ts apps/server/tests/integration/connect-cli.test.ts`

Expected: missing provider/CLI.

- [ ] **Step 3: Implement persistent SDK provider**

Implement SDK callbacks for client metadata, saved client information, token load/save, code verifier load/save, and `redirectToAuthorization`. Keep verifier/state in process memory for the one-shot flow; persist only client information and tokens encrypted.

- [ ] **Step 4: Implement enrollment command**

Start the loopback server before constructing the provider, connect the MCP client to trigger authorization, print the authorization URL, await a validated callback, call `transport.finishAuth(params)`, reconnect, list tools, persist connected state, then close the callback server and MCP client in `finally`.

- [ ] **Step 5: Run tests GREEN**

Run: `npm test -- apps/server/tests/unit/oauth-provider.test.ts apps/server/tests/integration/connect-cli.test.ts`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/robinhood apps/server/tests apps/server/package.json docker-entrypoint.sh
git commit -m "feat: add Robinhood OAuth enrollment command"
```

### Task 5: Clerk backend owner verifier and trusted runtime composition

**Files:**
- Modify: `apps/server/package.json`
- Modify: `package-lock.json`
- Create: `apps/server/src/runtime/clerk-owner-verifier.ts`
- Create: `apps/server/src/runtime/trusted-composition.ts`
- Modify: `apps/server/src/worker.ts`
- Modify: `apps/server/src/api.ts`
- Modify: `apps/server/src/config.ts`
- Test: `apps/server/tests/unit/clerk-owner-verifier.test.ts`
- Test: `apps/server/tests/unit/runtime-composition.test.ts`
- Test: `apps/server/tests/unit/worker.test.ts`

**Interfaces:**
- Produces: `createApiComposition()` and `createWorkerComposition()` for the existing dynamic composition loader.

- [ ] **Step 1: Write failing Clerk and composition tests**

Assert `authenticateRequest()` receives exact `authorizedParties`, only session tokens are accepted, verified email is fetched from Clerk Backend, owner mismatch fails, session `iat` maps to `single_factor`, and passkey-only routes remain unavailable. Assert worker composition pins the Robinhood endpoint and provides the encrypted OAuth-backed MCP transport and heartbeat callback.

- [ ] **Step 2: Run tests RED**

Run: `npm test -- apps/server/tests/unit/clerk-owner-verifier.test.ts apps/server/tests/unit/runtime-composition.test.ts apps/server/tests/unit/worker.test.ts`

Expected: missing concrete composition.

- [ ] **Step 3: Install Clerk Backend and implement verifier**

Run: `npm install --workspace @aurum/server @clerk/backend@3.16.12`

Use `createClerkClient({ secretKey, publishableKey })`, call `authenticateRequest(request, { authorizedParties: [WEB_ORIGIN], acceptsToken: 'session_token' })`, require authenticated user/session IDs, fetch the user, and return the verified primary email. Do not synthesize passkey assurance.

- [ ] **Step 4: Implement trusted compositions and development-origin rule**

Allow HTTP only when `NODE_ENV !== 'production'` and hostname is `localhost`, `127.0.0.1`, or `[::1]`. API composition provides owner verifier and a credential/heartbeat health probe. Worker composition provides the pinned OAuth transport and a safe post-promotion callback.

- [ ] **Step 5: Run tests GREEN and typecheck**

Run: `npm test -- apps/server/tests/unit/clerk-owner-verifier.test.ts apps/server/tests/unit/runtime-composition.test.ts apps/server/tests/unit/worker.test.ts && npm run typecheck`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/server/package.json apps/server/src apps/server/tests
git commit -m "feat: compose Clerk and Robinhood connected runtime"
```

### Task 6: Clerk React sign-in boundary

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Create: `apps/web/components/auth/ClerkAuthBoundary.tsx`
- Create: `apps/web/app/sign-in/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/app-shell/DashboardShell.tsx`
- Modify: `apps/web/lib/api/connected-data-source.ts`
- Test: `apps/web/tests/unit/clerk-auth-boundary.test.tsx`
- Test: `apps/web/tests/unit/data-source.test.ts`

**Interfaces:**
- Consumes: server-supplied public Clerk key and the existing same-origin BFF.
- Produces: signed-out sign-in UI, signed-in dashboard shell, and owner sign-out control.

- [ ] **Step 1: Write failing auth UI and 401 tests**

Assert demo mode never initializes Clerk, connected mode renders a loading state then sign-in UI for signed-out users, signed-in users see the dashboard and user button, and API 401 links/redirects to `/sign-in` without leaking the failed payload.

- [ ] **Step 2: Run tests RED**

Run: `npm test -- apps/web/tests/unit/clerk-auth-boundary.test.tsx apps/web/tests/unit/data-source.test.ts`

Expected: missing auth boundary.

- [ ] **Step 3: Install Clerk React and implement boundary**

Run: `npm install --workspace @aurum/web @clerk/react`

Wrap only connected mode in `ClerkProvider`. Use Clerk's prebuilt email-code sign-in and `UserButton`; do not render sign-up because the instance is invite-only. Pass only `CLERK_PUBLISHABLE_KEY` from the server layout.

- [ ] **Step 4: Run tests GREEN, accessibility test, and build**

Run: `npm test -- apps/web/tests/unit/clerk-auth-boundary.test.tsx apps/web/tests/unit/data-source.test.ts && npm run build --workspace @aurum/web`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json apps/web/package.json apps/web/app apps/web/components apps/web/lib apps/web/tests
git commit -m "feat: protect connected dashboard with Clerk"
```

### Task 7: Docker connected stack and operator runbook

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-entrypoint.sh`
- Modify: `.env.example`
- Modify: `apps/web/lib/api/bff.ts`
- Modify: `docs/operations/deployment.md`
- Create: `docs/operations/robinhood-enrollment.md`
- Test: `apps/web/tests/unit/bff.test.ts`

**Interfaces:**
- Produces: Docker services `web`, `api`, `worker`, `postgres`, `migrate`, and profile-gated `connect-robinhood`.

- [ ] **Step 1: Add failing BFF/private-service and compose assertions**

Assert development accepts only exact `http://api:8787` as the configured Docker service URL while production still rejects plaintext non-loopback origins. Assert the Compose file does not pass token values or expose PostgreSQL publicly.

- [ ] **Step 2: Run tests RED**

Run: `npm test -- apps/web/tests/unit/bff.test.ts`

Expected: Docker service URL rejected.

- [ ] **Step 3: Implement Compose services and entrypoint commands**

Add web port `3000`, API port `8787`, callback port `43117` only on the profile-gated enrollment service, `AURUM_TRUSTED_COMPOSITION_MODULE=/app/apps/server/src/runtime/trusted-composition.ts`, and dependency gates on migration health. Do not publish database port 5432.

- [ ] **Step 4: Update safe environment template and runbook**

Document exact commands:

```powershell
docker compose up -d postgres
docker compose up --build migrate
docker compose --profile ops run --service-ports --rm connect-robinhood
docker compose up -d --build api worker web
```

Keep all example secrets as unmistakable non-working placeholders.

- [ ] **Step 5: Run tests and Compose validation GREEN**

Run: `npm test -- apps/web/tests/unit/bff.test.ts && docker compose config --quiet`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker-entrypoint.sh .env.example apps/web/lib/api/bff.ts apps/web/tests/unit/bff.test.ts docs/operations
git commit -m "feat: add connected Docker runtime"
```

### Task 8: Full verification and live enrollment

**Files:**
- Modify if evidence changes: `docs/operations/verification-report.md`

**Interfaces:**
- Produces: verified running owner-only dashboard using last-good Robinhood snapshots.

- [ ] **Step 1: Run all static and automated checks**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Expected: all pass with zero failures.

- [ ] **Step 2: Rebuild and migrate the Docker stack**

Run:

```powershell
docker compose down
docker compose up -d postgres
docker compose up --build migrate
```

Expected: PostgreSQL healthy and migration exits 0.

- [ ] **Step 3: Perform owner OAuth enrollment**

Run: `docker compose --profile ops run --service-ports --rm connect-robinhood`

Expected: command prints an authorization URL and waits. The owner authorizes in the desktop browser; callback succeeds; command reports `connected` without printing token or account values.

- [ ] **Step 4: Start the connected services**

Set `APP_MODE=connected`, `AURUM_DATA_MODE=connected`, and the local service URLs in ignored `.env`, then run:

```powershell
docker compose up -d --build api worker web
```

Expected: API/web/worker remain running; `/ready` returns connected ready.

- [ ] **Step 5: Verify one live refresh and UI**

Sign in at `http://localhost:3000` through Clerk, request refresh, wait for a promoted snapshot, and verify the UI shows eight accounts, live provenance, masked account identifiers, and no Synthetic Demo badge. Compare aggregate account totals against the read-only connector without recording raw values in the report.

- [ ] **Step 6: Security regression check**

Run repository searches proving no `sk_test_`, bearer token, refresh token, raw account number, or write-capable MCP call is tracked. Confirm `.env` is ignored and container logs are redacted.

- [ ] **Step 7: Update verification report and commit**

```bash
git add docs/operations/verification-report.md
git commit -m "docs: verify Robinhood connected runtime"
```

- [ ] **Step 8: Push**

Run: `git push origin main`

Expected: all implementation commits reach `ChacoBee/Robinhood-Portfolios-Management`.
