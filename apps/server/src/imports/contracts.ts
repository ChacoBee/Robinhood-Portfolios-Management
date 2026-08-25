import type { Money, TransactionKind } from '@aurum/domain';

export const IMPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxRows: 5_000,
  maxPages: 250,
  maxColumns: 64,
  maxCellCharacters: 10_000,
} as const;

export type ImportMediaType = 'text/csv' | 'application/pdf';
export type ImportRowDecision = 'accepted' | 'duplicate' | 'review_required' | 'rejected';

export interface ImportInput {
  userId: string;
  accountId: string;
  filename: string;
  mediaType: ImportMediaType;
  bytes: Uint8Array;
}

export interface CsvSourceRow {
  rowNumber: number;
  values: Readonly<Record<string, string>>;
  canonical: string;
}

export interface ImportCandidate {
  id: string;
  source: string;
  accountId: string;
  kind: TransactionKind;
  amount: Money;
  effectiveAt: string;
  description: string;
  sourceTransactionId: string | null;
  sourceFingerprint: string;
  sourceLocation: string;
  rawChecksum: string;
  parserVersion: string;
  mappingVersion: string;
}

export interface ExistingImportFact {
  source: string;
  accountId: string;
  kind: TransactionKind;
  amount: Money;
  effectiveAt: string;
  description: string;
  sourceTransactionId: string | null;
  sourceFingerprint: string;
}

export interface ImportPreviewRow {
  candidate: ImportCandidate | null;
  decision: ImportRowDecision;
  messages: string[];
  sourceLocation: string;
}

export interface ImportPreview {
  id: string;
  userId: string;
  accountId: string;
  filename: string;
  mediaType: ImportMediaType;
  fileSha256: string;
  acceptedRows: number;
  duplicateRows: number;
  ambiguousRows: number;
  rejectedRows: number;
  rows: ImportPreviewRow[];
  evidenceKey: string;
  evidenceExpiresAt: string;
  parserVersion: string;
  mappingVersion: string;
  state: 'preview_ready' | 'confirmed' | 'deletion_pending' | 'non_reproducible';
}

export interface ImportConfirmation {
  previewId: string;
  userId: string;
  selectedCandidateIds: readonly string[];
}

export interface ImportResult {
  previewId: string;
  importedRows: number;
  skippedRows: number;
  state: 'confirmed' | 'already_confirmed';
}

export interface EvidenceStore {
  putEncrypted(input: {
    userId: string;
    content: Uint8Array;
    contentSha256: string;
    mediaType: ImportMediaType;
    expiresAt: string;
  }): Promise<{ key: string }>;
  delete(key: string): Promise<void>;
  markNonReproducible(previewId: string): Promise<void>;
}

export interface ImportStateStore {
  findByFileHash(userId: string, fileSha256: string): Promise<ImportPreview | null>;
  savePreview(
    preview: ImportPreview,
  ): Promise<{ preview: ImportPreview; created: boolean }>;
  loadPreview(previewId: string): Promise<ImportPreview | null>;
  /**
   * Atomically authorize the owner and enforce uniqueness for
   * source/account/stable-ID (or source fingerprint when no ID exists)
   * across every previously confirmed preview owned by that user.
   */
  confirm(input: {
    previewId: string;
    userId: string;
    candidates: readonly ImportCandidate[];
  }): Promise<
    | 'confirmed'
    | 'already_confirmed'
    | 'confirmation_conflict'
    | 'import_preview_not_found'
    | 'invalid_candidate_selection'
    | 'preview_integrity_error'
  >;
  markEvidenceDeletionPending(previewId: string): Promise<void>;
  markNonReproducible(previewId: string): Promise<void>;
}

export interface StatementDraft {
  page: number;
  line: number;
  text: string;
}

export interface StatementTextExtractor {
  extract(bytes: Uint8Array, limits: { maxPages: number }): Promise<readonly StatementDraft[]>;
}
