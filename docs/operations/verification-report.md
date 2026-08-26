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

| Check | Result |
| --- | --- |
| `npm audit --omit=dev` | Passed: 0 vulnerabilities |
| `npm run lint` | Passed for server, web, and domain workspaces |
| `npm run typecheck` | Passed for server, web, and domain workspaces |
| Focused live adapter tests | 18 contract/snapshot/refresh tests passed |
| `npm run build` | Server TypeScript and web production builds passed |
| `npm run test:e2e` | 18 Chromium tests passed on clean retry |
| `npm run db:check --workspace @aurum/server` | Drizzle schema check passed |
| Reachable-history Gitleaks | 46 commits scanned with redaction; no leaks found |

`5f13f14` adds a reviewed `.gitleaks.toml` that extends the default rules and
allows only two false-positive rule IDs in specific synthetic test paths. It
does not globally disable secret detection.

## Remaining concern

The full Vitest suite intermittently times out in the Compose integration test
when tests run in parallel. In the completion pass, 65 files / 329 tests passed
before that one timeout; the same Compose test passed in isolation. This report
does not treat the full-suite result as clean until that timing issue is
stabilized.

## Data truth boundary

The committed Demo contains invented data. Live Robinhood data is neither
embedded nor exposed by the public application. Connected operation remains
gated by private deployment configuration and the verified closed read boundary.
