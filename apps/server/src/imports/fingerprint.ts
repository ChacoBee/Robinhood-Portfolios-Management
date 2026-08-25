import { createHash } from 'node:crypto';

export const TRANSACTION_FINGERPRINT_VERSION = 'transaction-v1';

export function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function transactionFingerprint(input: {
  source: string;
  accountId: string;
  sourceTransactionId: string | null;
  effectiveAt: string;
  kind: string;
  amount: string;
  description: string;
  sourceLineage: string;
}): string {
  const uniqueSourceIdentity = input.sourceTransactionId
    ? { type: 'stable_id', value: input.sourceTransactionId }
    : {
        type: 'derived',
        effectiveAt: input.effectiveAt,
        kind: input.kind,
        amount: input.amount,
        description: input.description.trim().replace(/\s+/g, ' ').toLowerCase(),
        sourceLineage: input.sourceLineage,
      };
  return sha256(
    JSON.stringify({
      version: TRANSACTION_FINGERPRINT_VERSION,
      source: input.source,
      accountId: input.accountId,
      identity: uniqueSourceIdentity,
    }),
  );
}
