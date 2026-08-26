# Robinhood Live Connection Design

## Status

Approved for implementation under the owner's standing instruction to complete
the integration end to end without additional approval checkpoints.

## Goal

Connect the private Aurum runtime to the owner's Robinhood Trading MCP account,
sync every brokerage account into immutable PostgreSQL snapshots, and serve
those snapshots to the invite-only Clerk owner without exposing brokerage
credentials or a generic MCP proxy to the browser.

## Verified provider contract

Verified on 2026-08-25 against Robinhood's published support page, OAuth
metadata, the installed authenticated Robinhood connector, and the MCP
TypeScript SDK documentation.

- MCP endpoint: `https://agent.robinhood.com/mcp/trading`
- OAuth issuer/resource: `https://agent.robinhood.com/mcp/trading`
- Authorization endpoint: `https://robinhood.com/oauth`
- Registration endpoint: `https://agent.robinhood.com/oauth/trading/register`
- Token endpoint: `https://api.robinhood.com/oauth2/token/`
- Grants: authorization code and refresh token
- PKCE method: S256
- Token endpoint authentication: `none`
- Provider scope: exactly `internal`
- MCP transport: Streamable HTTP

Robinhood does not publish a separate read-only OAuth scope. The grant can
therefore expose write-capable tools at the provider, while Aurum itself must
enforce read-only behavior structurally.

## Read-only security boundary

The worker may call only these raw MCP tool names:

- `get_accounts`
- `get_portfolio`
- `get_equity_positions`
- `get_equity_quotes`
- `get_option_positions`
- `get_option_quotes`
- `get_option_instruments`

All tool names are compile-time literals and checked again at runtime. The
transport has no generic public call route. Tools whose names contain order,
place, cancel, exercise, transfer, watchlist mutation, or scan mutation are
not represented in the allowed type and are rejected before network I/O.

The MCP endpoint and OAuth metadata origins are pinned to the exact Robinhood
HTTPS origins above. Redirects to unapproved origins fail closed. The worker
uses the official MCP client and Streamable HTTP transport so initialization,
protocol negotiation, sessions, and structured tool results are handled by the
SDK instead of hand-written JSON-RPC.

## OAuth enrollment and token storage

A one-time `connect-robinhood` operator command runs inside the private Docker
stack. It starts a loopback callback on a fixed host port, performs Dynamic
Client Registration and PKCE through the MCP SDK, prints/opens the Robinhood
authorization URL, validates callback state and issuer, completes the token
exchange, then verifies an MCP connection before declaring success.

The OAuth client information and token set are encrypted with AES-256-GCM and
stored in PostgreSQL in a single-owner provider credential record. A dedicated
`ROBINHOOD_OAUTH_ENCRYPTION_KEY` encrypts those secrets; the existing account
reference key remains separate. Plain access tokens, refresh tokens, account
numbers, and authorization codes must never be logged, returned by an API, or
written to Git.

The long-running worker loads the encrypted record, lets the SDK refresh tokens,
persists every rotated token set atomically, and deletes the record on an
explicit disconnect. Missing, expired-without-refresh, malformed, or
undecryptable grants keep connected mode unavailable and preserve the last-good
portfolio snapshot.

## Provider payload normalization

The authenticated connector showed eight accounts. Provider payloads use
`account_number`, not the synthetic `account_id` contract currently in the
repository.

Normalization rules:

- Account identity is the raw `account_number` only inside the encrypted vault.
  Public models receive a masked last-four display and HMAC-stable identifier.
- Account display name uses `nickname` when present, otherwise a normalized
  brokerage-account-type label. Deactivated/closed flags map to closed status.
- `get_portfolio` is authoritative for total value, cash, buying power, and the
  aggregate value of every supported asset class.
- Equity positions are paginated. Their current market values are quantity
  multiplied by the freshest valid quote. Cost basis is quantity multiplied by
  `average_buy_price` when available.
- Equity quotes use the newer of regular and non-regular trade timestamps. The
  adapter rejects untraded or unresolved symbols instead of inventing prices.
- Option positions are paginated and filtered to nonzero positions. Current
  values use `mark_price * quantity * trade_value_multiplier`; contract details
  come only from read tools.
- Provider responses that do not contain a source timestamp receive a local
  `receivedAt` timestamp explicitly marked as adapter receipt time.
- Null rows, duplicate identities, pagination loops, response drift, currency
  drift, missing quotes, and non-finite decimal operations fail the refresh.

Portfolio reconciliation retains provider `total_value` as the headline. The
detail view may be marked partial when aggregate values include asset classes
for which the MCP does not expose position-level tools; those values remain in
the headline and are never silently dropped.

## Clerk owner authentication

The React client loads Clerk with the publishable key only. Signed-out users
see a dedicated sign-in screen. Signed-in requests carry the short-lived Clerk
session token through the same-origin Aurum BFF to the private API.

The API uses `@clerk/backend` to cryptographically authenticate the request,
restrict the authorized party, fetch the verified primary email, and enforce
the exact configured owner User ID and email. The secret key remains API-only.

The current Clerk Hobby plan does not provide passkeys. Read-only portfolio
access accepts the verified single-factor owner session. Export, deletion,
recovery-code regeneration, or any route that requires recent passkey assurance
remains disabled rather than weakening its policy.

Development may use an exact loopback HTTP web origin. Any non-loopback origin,
and every production origin, must be exact HTTPS.

## Runtime composition

The trusted composition is a committed implementation with no embedded
credentials. It obtains secrets only from validated server environment values
and provides:

- a Clerk owner verifier for the API;
- a PostgreSQL-backed provider health probe;
- the SDK MCP transport and encrypted OAuth store for the worker;
- the existing PostgreSQL alert evaluator after snapshot promotion.

The API never receives Robinhood tokens. The browser never receives Clerk
secret keys, Robinhood tokens, raw account numbers, provider payloads, or MCP
tool names.

## Docker and local development

Docker Compose includes PostgreSQL, migrations, API, worker, and a one-shot
Robinhood connection command. The web application runs on localhost during
development and points its server-side BFF at the local API. The worker starts
only after enrollment succeeds. Production requires TLS termination and the
same exact-origin restrictions.

## Health and failure behavior

- `/ready` reports infrastructure and Clerk composition readiness.
- `/v1/health` reports provider enrollment, token usability, worker heartbeat,
  and last-good snapshot age without credential details.
- A provider outage or failed refresh removes the live badge but keeps the
  last-good snapshot available.
- OAuth or schema failures are reduced to safe internal codes; logs redact
  authorization headers, cookies, tokens, and account identifiers.
- Disconnect revokes/deletes the local credential record, stops new refreshes,
  and retains historical snapshots until the owner separately requests data
  deletion.

## Testing

Implementation follows test-first development:

- unit tests for origin pinning, tool allowlisting, encryption, state/PKCE,
  pagination, payload normalization, valuation, and Clerk principal mapping;
- contract tests using real-shape sanitized fixtures for accounts, portfolios,
  positions, quotes, and options;
- integration tests for encrypted credential persistence, token rotation,
  owner bootstrap, refresh promotion, health degradation, and disconnect;
- Docker smoke tests for migration, API readiness, enrollment callback, worker
  startup, and a live read-only refresh;
- regression scans proving no write-capable tool name or raw token is reachable
  from public routes or logs.

## Sources

- Robinhood Agentic Trading overview:
  `https://robinhood.com/us/en/support/articles/agentic-trading-overview/`
- Robinhood OAuth protected-resource and authorization-server metadata at the
  pinned origins listed above.
- MCP TypeScript SDK client and OAuth documentation:
  `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md`
- Clerk backend request authentication:
  `https://clerk.com/docs/reference/backend/authenticate-request`
- Clerk React quickstart and session architecture:
  `https://clerk.com/docs/react/getting-started/quickstart`
  and `https://clerk.com/docs/guides/how-clerk-works/overview`
