import type { ExistingImportFact, ImportCandidate, ImportRowDecision } from './contracts';

function sameMoney(left: ImportCandidate, right: ExistingImportFact): boolean {
  return left.amount.currency === right.amount.currency && left.amount.amount === right.amount.amount;
}

function normalizedDescription(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function decideTransactionDeduplication(
  candidate: ImportCandidate,
  existing: readonly ExistingImportFact[],
): { decision: Exclude<ImportRowDecision, 'rejected'>; reason: string } {
  const exact = existing.find(
    (item) =>
      item.accountId === candidate.accountId &&
      item.source === candidate.source &&
      (item.sourceFingerprint === candidate.sourceFingerprint ||
        (candidate.sourceTransactionId !== null &&
          item.sourceTransactionId === candidate.sourceTransactionId)),
  );
  if (exact) return { decision: 'duplicate', reason: 'Exact source identity already exists' };

  const candidateTime = new Date(candidate.effectiveAt).valueOf();
  const near = existing.find((item) => {
    const timeDistance = Math.abs(new Date(item.effectiveAt).valueOf() - candidateTime);
    return (
      item.accountId === candidate.accountId &&
      (candidate.sourceTransactionId === null || item.sourceTransactionId === null) &&
      item.kind === candidate.kind &&
      sameMoney(candidate, item) &&
      timeDistance <= 24 * 60 * 60 * 1_000 &&
      normalizedDescription(item.description) === normalizedDescription(candidate.description)
    );
  });
  if (near) {
    return {
      decision: 'review_required',
      reason: 'A near match exists without the same stable source identity',
    };
  }
  if (candidate.sourceTransactionId !== null) {
    return { decision: 'accepted', reason: 'Distinct stable source identity' };
  }
  return { decision: 'accepted', reason: 'No prior match found' };
}
