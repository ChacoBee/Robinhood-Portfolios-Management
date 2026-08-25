# Aurum

Aurum is a modern, responsive portfolio command center with an Obsidian Gold interface. This public repository ships in **Synthetic Demo** mode: every account, holding, balance, activity item, and timestamp in the preview is invented.

The connected architecture is private-ready and strictly read-only. It can aggregate authorized Robinhood account data only after a separate application-side OAuth/MCP grant proves the expected issuer, audience, expiry, approved endpoint, and exact read scopes. Codex, browser, or development-agent connector credentials are never exported into this application.

## What is included

- Portfolio overview, accounts, holdings, performance, analytics, activity, reconciliation, alerts, imports, and settings.
- Responsive desktop rail and mobile navigation, Screen Privacy Mode, semantic chart tables, keyboard navigation, and reduced-motion support.
- Deterministic money calculations, reconciliation, freshness policy, immutable snapshots, leased background jobs, and last-good promotion.
- A closed Robinhood adapter with an explicit read-method allowlist. There are no trading, transfer, cancellation, exercise, or generic MCP proxy routes.
- Synthetic/API data-source isolation: connected failures never fall back to Demo values.
- Fastify API, PostgreSQL persistence, dedicated worker, Docker/Compose, CI, and security scanning.

## Run the public Demo

Requirements: Node.js 24 and npm 11.

```bash
npm ci
npm run dev:web
```

Open `http://127.0.0.1:3000`. No brokerage, database, Clerk, or notification credentials are loaded in Demo mode.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit --audit-level=high
```

The latest recorded local results and environment limitations are in the
[verification report](docs/operations/verification-report.md).

Docker is optional:

```bash
docker build -t aurum-portfolio:local .
```

The image accepts `api`, `worker`, or `migrate`. Connected Compose use also requires the fail-closed environment contract documented in [deployment](docs/operations/deployment.md).

## Data modes

| Mode | Browser data | External services | Public-safe |
| --- | --- | --- | --- |
| Synthetic Demo | Versioned invented fixtures | None | Yes |
| Disconnected | Retained imported/last-good facts with explicit status | No live brokerage reads | Private only |
| Connected | Server-normalized, authorized read-only data | PostgreSQL, Clerk, verified Robinhood OAuth/MCP | Private only |

See [live-data boundary](docs/architecture/live-data-boundary.md), [security policy](SECURITY.md), and [deployment runbook](docs/operations/deployment.md).

## Disclaimer

Aurum is an independent project and is not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc. It is portfolio monitoring software, not investment, tax, or legal advice.
