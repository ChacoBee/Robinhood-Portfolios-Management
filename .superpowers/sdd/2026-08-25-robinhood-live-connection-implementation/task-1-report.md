# Task 1: Real Robinhood contract and valuation

## Changed files

- `apps/server/src/robinhood/read-methods.ts`
- `apps/server/src/robinhood/schemas.ts`
- `apps/server/src/robinhood/client.ts`
- `apps/server/src/robinhood/mapper.ts`
- `apps/server/src/sync/refresh-service.ts`
- `apps/server/tests/contract/robinhood-read-client.test.ts`
- `apps/server/tests/integration/refresh-service.test.ts`
- `apps/server/tests/unit/transport.test.ts` (updated the existing typed transport fixture to the raw tool names and `internal` scope contract)

## RED evidence

Command:

```powershell
npm test -- apps/server/tests/contract/robinhood-read-client.test.ts
```

Result: 5 of 5 tests failed as expected. The failures showed the former
`mcp__robinhood__*` tool names, synthetic account/position schemas, and quote
shape could not satisfy the real raw-provider fixtures. The pagination test
failed with `provider_schema_drift` because the old client accepted only the
synthetic `positions` payload.

The later nullable-row regression was also observed RED before its handling was
implemented: the client resolved `[]` for `{ results: [null], next: null }`
where the contract requires `provider_schema_drift`.

## GREEN verification

```powershell
npm test -- apps/server/tests/contract/robinhood-read-client.test.ts apps/server/tests/integration/refresh-service.test.ts apps/server/tests/unit/transport.test.ts
# 3 files passed, 13 tests passed

npm run typecheck --workspace @aurum/server
# exited 0

npm test --workspace @aurum/server
# 37 files passed, 173 tests passed

git diff --check
# exited 0
```

## Commit

`fbb28bb` (`feat: normalize live Robinhood portfolio payloads`)

## Self-review

- Read tools are compile-time raw literals and runtime-checked; all seven
  permitted tools are represented and no wrapper-prefixed name crosses the
  provider boundary.
- Raw provider schemas are strict, receipt timestamps are injected for
  timestamp-less payloads, and account identity is only the vaulted
  `account_number`.
- Pagination passes account number and cursor, detects repeated cursors, and
  rejects null rows, duplicate identities, missing/unrequested quote records,
  non-USD values, absent trades, and non-finite arithmetic.
- Equity and option values are calculated from quote/instrument inputs before
  `buildSnapshotPromotion`; symbol and option calls batch at 20 records.
- Existing persistence observation interfaces remain the promotion inputs.
