# Backup and restore runbook

1. Use encrypted managed PostgreSQL backups with daily snapshots and point-in-time recovery.
2. Test restore into an isolated network at least quarterly. Never restore into public Demo infrastructure.
3. Verify schema migration level, owner identity mapping, snapshot counts, audit-chain continuity, and job leases before enabling the API.
4. Keep the restored worker disabled until the latest current snapshot and provider connection state are reviewed.
5. Rotate database and application secrets after any emergency restore involving a compromised environment.

Evidence objects use a private encrypted bucket and their own lifecycle policy. Deleting source evidence marks affected import batches non-reproducible while retaining normalized facts and versioned lineage. Database backups must not be used to defeat an owner deletion request after the documented retention expiry.
