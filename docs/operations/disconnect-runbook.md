# Disconnect runbook

1. Disable the verified Robinhood grant at the authorization provider and revoke the upstream grant.
2. Stop workers or remove their secret-store permission. Leave the API read-only.
3. Mark connection state `disconnected`; retain last-good/imported facts with their original timestamps and an explicit status.
4. Confirm no new refresh jobs are promoted and inspect redacted audit events.
5. Rotate affected secrets and remove approved egress when compromise is suspected.
6. Let the owner export or delete Aurum data independently of upstream revocation.

Never replace disconnected values with Synthetic Demo fixtures. Demo and connected histories are different sources and remain isolated.
