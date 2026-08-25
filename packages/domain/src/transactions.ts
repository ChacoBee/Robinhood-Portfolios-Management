import type { Money } from './money';
import type { Provenance } from './provenance';

export type TransactionKind =
  | 'deposit'
  | 'withdrawal'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'trade'
  | 'internal_transfer'
  | 'corporate_action'
  | 'unknown';

export interface NormalizedTransaction {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amount: Money;
  effectiveAt: string;
  description: string;
  sourceTransactionId?: string;
  sourceFingerprint: string;
  provenance: Provenance;
}

export function isExternalFlow(kind: TransactionKind): boolean {
  return kind === 'deposit' || kind === 'withdrawal';
}
