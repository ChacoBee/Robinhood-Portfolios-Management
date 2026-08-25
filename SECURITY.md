# Security policy

## Reporting

Please do not open a public issue for a vulnerability or suspected data exposure. Use GitHub's private vulnerability reporting for this repository. Include affected commit, reproduction steps, impact, and any safe remediation suggestion; do not include real brokerage credentials or portfolio exports.

## Supported version

Security fixes target the latest commit on `main`.

## Security boundaries

- The public deployment is Synthetic Demo only.
- Robinhood access is server-side, read-only, origin-pinned, scope-verified, and allowlisted by method.
- Browser-supplied connector methods, arguments, endpoints, or credentials are rejected by design.
- Provider identifiers are encrypted or keyed-hashed at rest. Public API models expose only application IDs and masked account labels.
- Connected mode requires exact-owner authorization, narrow CORS, CSRF protection on cookie-authenticated mutations, rate limits, and structured redaction.
- Secrets belong in a managed secret store. Never commit `.env` files, exports, statements, screenshots, database dumps, OAuth grants, or recovery codes.

If a connection or scope cannot be verified, Aurum must remain Demo/Disconnected. It must not silently substitute synthetic values for connected data.
