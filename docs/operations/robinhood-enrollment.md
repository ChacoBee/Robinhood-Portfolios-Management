# Robinhood connected local enrollment

This is a private operator flow. It never uses Codex, browser, or development-agent credentials, and the repository contains no usable Robinhood credentials. Copy `.env.example` to ignored `.env`, replace every placeholder with locally provisioned values, and keep the two encryption keys distinct.

Run the stack from the repository root in PowerShell:

```powershell
docker compose up -d postgres
docker compose up --build migrate
docker compose --profile ops run --service-ports --rm connect-robinhood
docker compose up -d --build api worker web
```

The enrollment command prints the Robinhood authorization URL and waits for the browser callback. Robinhood OAuth uses the provider scope exactly `internal`; that provider grant may expose write-capable tools and must not be described as provider read-only. Aurum enforces read-only behavior structurally: its worker has a compile-time and runtime seven-tool read allowlist, and neither the API nor browser exposes a generic MCP proxy. Docker listens inside the one-shot container on `0.0.0.0:43117`, but Compose publishes the callback only as `127.0.0.1:43117`; the registered redirect remains exactly `http://127.0.0.1:43117/callback`.

The final command runs a one-shot `verify-enrollment` gate before the worker. It checks the configured owner's connected credential and decryptability without creating an MCP transport or starting scheduler/refresh jobs. It exits safely without starting the worker when enrollment is absent, incomplete, or cannot be decrypted. The worker repeats this verification in-process, so the Compose gate cannot be bypassed by a direct worker invocation.

Confirm local infrastructure through `http://127.0.0.1:8787/ready`; use `/v1/health` for provider, worker-heartbeat, and last-good-snapshot status. The API and worker preserve last-good snapshots when the provider is unavailable. Logs are intentionally redacted: never paste logs that contain credentials, cookies, authorization URLs, callback query strings, account identifiers, or portfolio data into tickets or chat.

To disconnect, run the application’s explicit disconnect operation; it removes the encrypted local grant and stops new refreshes while retaining snapshots until separately deleted. Re-enrollment is the same four-command flow. Rotate a compromised Clerk secret, CSRF secret, database password, or either encryption key through a planned maintenance procedure: stop the affected services, migrate/re-encrypt data as required, update the ignored operator environment, then re-enroll if the OAuth credential key changed. Never rotate the two encryption keys to the same value.

Clerk Hobby does not provide the required passkey assurance. Export, deletion, and recovery-code regeneration remain unavailable until a supported passkey-assurance configuration is present; do not weaken that policy for local convenience.
