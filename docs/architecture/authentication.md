# Authentication architecture

Verified against the official Clerk documentation on 2026-08-25.

## Connected-mode contract

Production uses an invite-only Clerk instance with one pre-provisioned owner. Public sign-up is disabled. The API authorizes only when all of the following are true:

1. Clerk has cryptographically authenticated the current session token.
2. The token is unexpired and its authorized party matches the configured web origin.
3. The principal's immutable Clerk user ID exactly matches `OWNER_CLERK_USER_ID`.
4. The principal's normalized primary email exactly matches `OWNER_EMAIL` and is verified.
5. The required recent verification age is satisfied for sensitive actions.

The trusted verifier must return a cryptographically validated authentication
method and verification timestamp. Export creation, account deletion, and
recovery-code regeneration require a passkey verification no more than five
minutes old; a password, single-factor session, missing timestamp, expired
verification, or future timestamp is rejected with
`recent_passkey_required`.

Clerk recommends `authenticateRequest()` or its SDK middleware for session-token verification; manual verification must validate signature, algorithm, expiry, not-before, and authorized party. Passkeys are domain-bound and can satisfy multi-factor authentication when enabled for the instance.

Official references:

- [Authenticate a backend request](https://clerk.com/docs/reference/backend/authenticate-request)
- [Session-token claims and verification](https://clerk.com/docs/guides/sessions/session-tokens)
- [Manual JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Passkey authentication flow](https://clerk.com/docs/guides/development/custom-flows/authentication/passkeys)
- [Invite-only access and restrictions](https://clerk.com/docs/guides/secure/restricting-access)
- [Revoke a session](https://clerk.com/docs/reference/backend/sessions/revoke-session)

## Recovery gate

Aurum recovery codes are application-owned, single-use, hashed records. A valid code alone never creates a normal session. Recovery additionally requires verified-email proof, revokes existing sessions, and grants only a short-lived passkey re-enrollment capability. Until a deployed Clerk flow demonstrates that dual proof and restricted capability end-to-end, recovery enrollment remains disabled and the Settings screen reports the gate explicitly.
