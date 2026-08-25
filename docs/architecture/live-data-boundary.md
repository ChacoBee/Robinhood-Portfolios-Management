# Live-data boundary

The browser never calls Robinhood and never receives Robinhood credentials, raw account references, provider payloads, or MCP method names.

```text
Browser -> Aurum API -> PostgreSQL last-good snapshots
                         ^
Verified OAuth grant -> dedicated worker -> pinned Robinhood MCP origin
```

The API only reads normalized snapshots. The worker is the sole process allowed to obtain a verified grant and call the fixed Robinhood read-method allowlist. A grant must prove issuer, audience, expiry, exact read scopes, and an approved endpoint origin. The adapter validates payload identity, freshness, completeness, valuation windows, and reconciliation before a single atomic promotion.

No generic proxy exists. Trading, transfer, cancellation, exercise, and other write-capable methods are absent. If any authorization, origin, data-quality, lease, or reconciliation check fails, the new observation is audited but the current last-good snapshot is retained.

The public Sites deployment is always Synthetic Demo. Live mode requires a separately provisioned application OAuth/MCP client and a private container runtime for the API, worker, PostgreSQL, KMS/secrets, and scheduler. Codex connector credentials are not application credentials and must never be copied or reused.
