# Verification report

Date: 2026-08-26

## Connected verification boundary

OAuth enrollment is verified. The connected API and web stack each returned
HTTP 200. Safe database checks confirmed only that an account was imported, a
sync succeeded, and a current snapshot exists. This report intentionally
excludes account identifiers, values, provider payloads, URLs, and credentials.

Aurum's worker may call exactly seven Robinhood tools:

- `get_accounts`
- `get_portfolio`
- `get_equity_positions`
- `get_equity_quotes`
- `get_option_positions`
- `get_option_quotes`
- `get_option_instruments`

The provider grant itself is broader than this boundary and must not be called
provider read-only. Aurum's safety boundary is the closed allowlist and absence
of a generic MCP proxy; tools outside this list are not called.

## Fresh checks

| UTC | Check | Result |
| --- | --- | --- |
| `2026-08-26T14:06:06Z` | Redacted connected verification evidence recorded | OAuth enrollment was verified; connected API and web each returned HTTP 200; safe database booleans confirmed an imported account, a successful sync, and a current snapshot. No identifiers, values, tokens, URLs, or payloads were retained. |
| `2026-08-26T14:14:09Z` | Focused enrollment-gate tests | 15 unit/Compose tests passed. |
| `2026-08-26T14:14:36Z` | `npm test` | Passed: 67 files / 335 tests. |
| `2026-08-26T14:15:13Z` | `npm audit --omit=dev` | Passed: 0 vulnerabilities. |
| `2026-08-26T14:15:14Z` | `npm audit` | Non-zero by design: 4 moderate dev-toolchain advisories through `drizzle-kit` and its legacy esbuild loader; the available remediation is a breaking `drizzle-kit` downgrade. |
| `2026-08-26T14:15:29Z` | `npm run lint` | Passed for server, web, and domain workspaces. |
| `2026-08-26T14:15:39Z` | `npm run typecheck` | Passed for server, web, and domain workspaces. |
| `2026-08-26T14:16:22Z` | `npm run build` | Server TypeScript and web production builds passed. |
| `2026-08-26T14:16:30Z` | `npm run db:check --workspace @aurum/server` | Drizzle schema check passed. |
| `2026-08-26T14:19:05Z` | Reachable-history Gitleaks | 50 branch-history commits scanned with redaction; no leaks found. |
| `2026-08-26T14:17:13Z` | Quiet Compose preflight | Passed with the ignored operator supplement; no Compose values were rendered. |
| `2026-08-26T14:22:05Z` | Focused complete-grant gate tests | 18 unit/Compose tests passed. |
| `2026-08-26T14:22:16Z` | `npm test` | Passed: 67 files / 338 tests. |
| `2026-08-26T14:24:16Z` | Read-only readiness smoke | API readiness and web each returned HTTP 200; the owner-protected health endpoint was not bypassed. |
| `2026-08-26T14:25:20Z` | `npm run test:e2e` | Passed: 18/18 Chromium tests. |
| `2026-08-26T14:27:15Z` | Docker image build | Passed without restarting or recreating the connected stack. |
| `2026-08-26T14:27:25Z` | PostgreSQL migration status | The existing one-shot migration container had exit code 0; no service was recreated. |

`5f13f14` and this final scan adjustment keep `.gitleaks.toml` extending the
default rules. The narrow rule-and-path allowlists cover only reviewed synthetic
fixtures; the `generic-api-key` exception now includes the same synthetic
`connect-cli` test path already covered for its distinct token rule. No rule is
globally disabled.

`8706d02` adds the fail-closed one-shot enrollment gate: Compose waits for it
before worker startup, and the worker repeats encrypted connected-grant
verification before transport, scheduler, or job-loop construction.

`e2de491` tightens that gate: both the encrypted token set and client
registration must decrypt to nonempty object records before worker authority is
created. Missing, empty, or non-object client registration material fails
closed without logging it.

## Remaining concern

The earlier parallel Compose-test timeout did not recur in the fresh full suite.
The current report records that successful run rather than claiming the full
dependency audit is clean; the dev-toolchain moderate advisories above remain.

## Data truth boundary

The committed Demo contains invented data. Live Robinhood data is neither
embedded nor exposed by the public application. Connected operation remains
gated by private deployment configuration and the verified closed read boundary.
