import { describe, expect, it } from 'vitest';
import type { ExistingImportFact, ImportCandidate } from '../../../src/imports';
import { decideTransactionDeduplication } from '../../../src/imports';

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    id: 'candidate-synthetic',
    source: 'robinhood',
    accountId: 'account-a',
    kind: 'deposit',
    amount: { amount: '1000', currency: 'USD' },
    effectiveAt: '2026-08-01T12:00:00.000Z',
    description: 'Synthetic funding',
    sourceTransactionId: 'source-001',
    sourceFingerprint: 'fingerprint-a',
    sourceLocation: 'row 2',
    rawChecksum: 'checksum-synthetic',
    parserVersion: 'csv-v1',
    mappingVersion: 'robinhood-activity-v1',
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingImportFact> = {}): ExistingImportFact {
  return {
    source: 'robinhood',
    accountId: 'account-a',
    kind: 'deposit',
    amount: { amount: '1000', currency: 'USD' },
    effectiveAt: '2026-08-01T12:00:00.000Z',
    description: 'Synthetic funding',
    sourceTransactionId: 'source-001',
    sourceFingerprint: 'fingerprint-existing',
    ...overrides,
  };
}

describe('decideTransactionDeduplication', () => {
  it('deduplicates the same source transaction ID within an account', () => {
    expect(decideTransactionDeduplication(candidate(), [existing()]).decision).toBe('duplicate');
  });

  it('does not merge the same source transaction ID across accounts', () => {
    expect(
      decideTransactionDeduplication(candidate(), [existing({ accountId: 'account-b' })]).decision,
    ).toBe('accepted');
  });

  it('does not merge the same source transaction ID across source namespaces', () => {
    expect(
      decideTransactionDeduplication(candidate(), [existing({ source: 'other-provider' })])
        .decision,
    ).toBe('accepted');
  });

  it('accepts visibly similar records when both have distinct stable IDs', () => {
    expect(
      decideTransactionDeduplication(candidate(), [
        existing({ sourceTransactionId: 'source-002' }),
      ]).decision,
    ).toBe('accepted');
  });

  it('requires review when a stable-ID record is near an existing record without an ID', () => {
    expect(
      decideTransactionDeduplication(candidate(), [existing({ sourceTransactionId: null })])
        .decision,
    ).toBe('review_required');
  });

  it('requires review for a near match when neither record has a stable ID', () => {
    expect(
      decideTransactionDeduplication(candidate({ sourceTransactionId: null }), [
        existing({ sourceTransactionId: null, effectiveAt: '2026-08-02T11:59:59.000Z' }),
      ]).decision,
    ).toBe('review_required');
  });

  it('does not trust a fingerprint match from a different account', () => {
    expect(
      decideTransactionDeduplication(candidate(), [
        existing({
          accountId: 'account-b',
          sourceTransactionId: null,
          sourceFingerprint: 'fingerprint-a',
        }),
      ]).decision,
    ).toBe('accepted');
  });
});
