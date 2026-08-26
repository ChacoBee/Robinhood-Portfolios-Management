# Deployment runbook

## Public Demo

Deploy `apps/web` with `AURUM_DATA_MODE=demo` (or no connected
configuration). The Demo must display `Synthetic Demo`, initialize no
brokerage/Clerk/database client, and contain only the committed fixture data.

## Private connected runtime

Use a TLS-terminating, container-capable platform with managed PostgreSQL, one API process, exactly one or more leased workers, and a separate migration release step. Restrict outbound worker traffic to the documented Robinhood OAuth/MCP hosts and notification providers. The API process does not receive durable Robinhood refresh credentials. Production origins must be exact HTTPS origins, and production PostgreSQL URLs must use `sslmode=verify-full`; terminate TLS before the web/API services and keep database ingress private.

Required operator gates:

- Create an invite-only Clerk application and pre-provision one owner.
- Configure exact owner user ID, verified email, trusted web origin, CSP, and HTTPS redirect URIs.
- Provision a dedicated Robinhood application OAuth/MCP client with exact read-only scopes.
- Implement/inject the verified grant provider backed by a managed KMS/secret store; do not use a raw bearer-token environment variable.
- Pin the approved MCP origin in code and infrastructure egress policy.
- Provision PostgreSQL with TLS, encrypted backups, point-in-time recovery, and least-privilege roles.
- Run `aurum migrate`, then `aurum api` and `aurum worker`; require healthy readiness before routing traffic.

Connected mode intentionally fails closed until every gate is present. See `.env.example` for non-secret field names only.

The connected API receives only `DATABASE_URL`, `OWNER_CLERK_USER_ID`,
`OWNER_EMAIL`, `WEB_ORIGIN`, `CLERK_PUBLISHABLE_KEY`, `CLERK_ISSUER_URL`,
`CLERK_SECRET_KEY`, and `CSRF_SECRET`. The worker receives the database and
owner identity plus the distinct account-reference and OAuth encryption keys;
it receives no Clerk secret, public key, or CSRF secret. The web runtime gets
only its public mode/origin/Clerk key and the private Docker service URL.
Robinhood access tokens and MCP endpoints are deliberately not environment
variables.

Set server-side `AURUM_API_URL` to the exact HTTPS API origin in production.
For the local Compose stack only, the BFF accepts exactly `http://api:8787`;
all other plaintext non-loopback upstream service URLs are rejected in
production. Browser writes use the allowlisted same-origin `/api/aurum` BFF,
which forwards only the session credentials and CSRF headers required by the
private API; no brokerage credential is exposed to the browser. Set
`AURUM_TRUSTED_COMPOSITION_MODULE` to an absolute path available only to the
private API/worker containers. The local Compose stack uses
`/app/apps/server/src/runtime/trusted-composition.ts`. That module must export
`createApiComposition()` and `createWorkerComposition()` factories for Clerk,
durable imports/alerts, export/deletion services, post-promotion alert
evaluation, and the verified Robinhood grant provider. The repository does not
accept those credentials from environment variables. Production PostgreSQL
must use `sslmode=verify-full`.

`createApiComposition()` must provide the exact-owner verifier and a
`connectedHealthProbe()` that reports a verified-provider boolean and the last
worker heartbeat without returning any credential. Connected API startup fails
closed without both. The verifier's authentication result must include the
cryptographically validated method and timestamp used for the current session;
the sensitive export, deletion, and recovery-code routes require a passkey
verified within the previous five minutes. Alert reads and actions use the repository's PostgreSQL
store unless a stricter private store is injected; export, deletion, recovery,
and statement parsing remain explicitly capability-gated.

After migrations, both API and worker startup idempotently bootstrap the single
configured owner from `OWNER_CLERK_USER_ID` and `OWNER_EMAIL`. Existing rows
matching the deterministic ID, normalized email, or Clerk ID are adopted rather
than duplicated. The migration enforces uniqueness on `lower(email)`; if the
configured ID, email, and Clerk ID already resolve to different rows, startup
fails with `configured_owner_identity_conflict` instead of choosing one. Any
startup failure closes the API and database resources before aborting.

`/ready` represents infrastructure and authentication composition readiness so
the API can keep serving the last validated snapshot during a provider outage
or stalled worker. Operational provider/worker state is reported separately by
`/v1/health`; the dashboard removes its live label and reports a degraded
connection without discarding last-good values.

`createWorkerComposition()` must provide the pinned MCP endpoint contract, the
verified read-only authorization provider, and `afterSnapshotPromoted()`. The
promotion callback must evaluate and persist factual alert evidence; worker
startup fails closed if it is absent. It must never place an order or expose a
generic MCP call surface.

The `migrate` container command reads `DATABASE_URL` through Drizzle's
`dbCredentials`. It rejects non-PostgreSQL URLs and, in production, URLs that
do not use `sslmode=verify-full`.

For the local Docker enrollment sequence, callback exposure, safe log handling,
disconnect/re-enrollment, and rotation precautions, see [Robinhood connected
local enrollment](robinhood-enrollment.md). The Compose file intentionally has
no `env_file` service inheritance: each process receives only its explicit
environment contract.
