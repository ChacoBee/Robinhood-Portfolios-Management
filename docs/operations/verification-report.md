# Verification report

Date: 2026-08-25

This report covers the public Synthetic Demo and the fail-closed connected
architecture in this repository. It does not claim that a private Robinhood
grant is installed or that live brokerage data was accessed.

## Passing checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed for server, web, and domain workspaces |
| `npm run typecheck` | Passed for server, web, and domain workspaces |
| `npm test` | 54 files, 234 tests passed |
| `npm run test:e2e` | 18 Chromium tests passed |
| `npm run build` | Server TypeScript and web production builds passed |
| `npm run db:check --workspace @aurum/server` | Drizzle schema check passed |
| `npm audit --audit-level=high` | Passed the high-severity gate |
| `git diff --check` | Passed |
| High-confidence working-tree and reachable-history secret scans | No matches found |

The E2E suite covers all primary routes, browser security headers, responsive
overflow at phone, tablet, and desktop widths, keyboard/accessibility checks,
privacy mode, Demo import, alerts, and destructive settings gates.

A separate production-server browser smoke verified nonce-based
`script-src 'strict-dynamic'` without `unsafe-inline`, successful hydration,
zero browser errors, and the interactive synthetic import preview.

## Known limitations

- `npm audit` reports four moderate development-tool findings through
  `drizzle-kit` and its legacy `esbuild` loader. The available automatic fix is
  a breaking downgrade, so it was not applied. No high or critical finding is
  present.
- Docker is not installed in the local verification environment, so the image
  could not be built locally. The GitHub Actions `container` job builds the
  Dockerfile on every pull request and push to `main`.
- Sites hosting is not enabled for the current workspace, so no Sites project
  was created. This does not affect local execution or GitHub delivery.
- Connected mode requires an operator-supplied private composition containing
  the owner verifier, operational health probe, post-promotion alert evaluator,
  durable capability services, and verified read-only Robinhood grant provider.
  Without it, connected API and worker startup fail closed by design.
- Connected daily investment movement remains unavailable until a source can
  prove complete deposit/withdrawal coverage for the close-to-current window.
  Raw portfolio value change is never mislabeled as flow-adjusted movement.

## Data truth boundary

The committed Demo contains invented accounts, holdings, activities, balances,
and timestamps. Live Robinhood data is neither embedded nor proxied through the
public application. A private deployment may enter Connected mode only after
the deployment gates in `docs/operations/deployment.md` are satisfied.
