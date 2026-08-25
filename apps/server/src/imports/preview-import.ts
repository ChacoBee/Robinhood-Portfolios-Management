import { randomUUID } from 'node:crypto';
import type {
  EvidenceStore,
  ExistingImportFact,
  ImportInput,
  ImportPreview,
  ImportPreviewRow,
  ImportStateStore,
  StatementTextExtractor,
} from './contracts';
import { ImportValidationError, validateImportInput } from './detect-format';
import { decideTransactionDeduplication } from './deduplicate';
import { sha256 } from './fingerprint';
import { normalizeCsvTransaction, CSV_MAPPING_VERSION, CSV_PARSER_VERSION } from './normalize-transaction';
import { parseCsv } from './parse-csv';
import { parseStatementDrafts } from './parse-statement';

export interface PreviewImportDependencies {
  evidenceStore: EvidenceStore;
  stateStore: ImportStateStore;
  listExisting(userId: string, accountId: string): Promise<readonly ExistingImportFact[]>;
  statementExtractor?: StatementTextExtractor;
  now?: () => Date;
  createId?: () => string;
}

function assertStoredPreviewIdentity(
  preview: ImportPreview,
  expected: { userId: string; fileSha256: string },
): void {
  if (preview.userId !== expected.userId || preview.fileSha256 !== expected.fileSha256) {
    throw new Error('preview_store_integrity_error');
  }
}

async function throwAfterEvidenceCleanup(
  evidenceStore: EvidenceStore,
  evidenceKey: string,
  error: unknown,
): Promise<never> {
  try {
    await evidenceStore.delete(evidenceKey);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      error instanceof Error ? error.message : 'Failed to persist import preview',
    );
  }
  throw error;
}

export async function previewImport(
  input: ImportInput,
  dependencies: PreviewImportDependencies,
): Promise<ImportPreview> {
  validateImportInput(input);
  const bytes = Uint8Array.from(input.bytes);
  const fileSha256 = sha256(bytes);
  const prior = await dependencies.stateStore.findByFileHash(input.userId, fileSha256);
  if (prior) {
    assertStoredPreviewIdentity(prior, { userId: input.userId, fileSha256 });
    if (prior.accountId !== input.accountId) {
      throw new ImportValidationError(
        'file_account_mismatch',
        'Import file is already linked to a different account',
      );
    }
    return prior;
  }

  const now = dependencies.now?.() ?? new Date();
  const evidenceExpiresAt = new Date(now.valueOf() + 90 * 24 * 60 * 60 * 1_000).toISOString();

  let rows: ImportPreviewRow[];
  if (input.mediaType === 'application/pdf') {
    rows = await parseStatementDrafts(bytes, dependencies.statementExtractor);
  } else {
    const sourceRows = parseCsv(bytes);
    const existing = await dependencies.listExisting(input.userId, input.accountId);
    const seen: ExistingImportFact[] = [];
    rows = sourceRows.map((sourceRow) => {
      try {
        const candidate = normalizeCsvTransaction(sourceRow, input.accountId, fileSha256);
        const deduplication = decideTransactionDeduplication(candidate, [...existing, ...seen]);
        seen.push(candidate);
        return {
          candidate,
          decision: deduplication.decision,
          messages: [deduplication.reason],
          sourceLocation: candidate.sourceLocation,
        };
      } catch (error) {
        return {
          candidate: null,
          decision: 'rejected',
          messages: [error instanceof Error ? error.message : 'Invalid import row'],
          sourceLocation: `row ${sourceRow.rowNumber}`,
        };
      }
    });
  }

  const evidence = await dependencies.evidenceStore.putEncrypted({
    userId: input.userId,
    content: bytes,
    contentSha256: fileSha256,
    mediaType: input.mediaType,
    expiresAt: evidenceExpiresAt,
  });

  const preview: ImportPreview = {
    id: dependencies.createId?.() ?? randomUUID(),
    userId: input.userId,
    accountId: input.accountId,
    filename: input.filename,
    mediaType: input.mediaType,
    fileSha256,
    acceptedRows: rows.filter((row) => row.decision === 'accepted').length,
    duplicateRows: rows.filter((row) => row.decision === 'duplicate').length,
    ambiguousRows: rows.filter((row) => row.decision === 'review_required').length,
    rejectedRows: rows.filter((row) => row.decision === 'rejected').length,
    rows,
    evidenceKey: evidence.key,
    evidenceExpiresAt,
    parserVersion: input.mediaType === 'text/csv' ? CSV_PARSER_VERSION : 'pdf-review-v1',
    mappingVersion: input.mediaType === 'text/csv' ? CSV_MAPPING_VERSION : 'pdf-review-v1',
    state: 'preview_ready',
  };
  let saved: Awaited<ReturnType<ImportStateStore['savePreview']>>;
  try {
    saved = await dependencies.stateStore.savePreview(preview);
  } catch (error) {
    return throwAfterEvidenceCleanup(dependencies.evidenceStore, evidence.key, error);
  }
  if (saved.created) {
    try {
      assertStoredPreviewIdentity(saved.preview, { userId: input.userId, fileSha256 });
      if (saved.preview.id !== preview.id || saved.preview.evidenceKey !== evidence.key) {
        throw new Error('preview_store_integrity_error');
      }
    } catch (error) {
      return throwAfterEvidenceCleanup(dependencies.evidenceStore, evidence.key, error);
    }
    return saved.preview;
  }

  await dependencies.evidenceStore.delete(evidence.key);
  assertStoredPreviewIdentity(saved.preview, { userId: input.userId, fileSha256 });
  if (saved.preview.accountId !== input.accountId) {
    throw new ImportValidationError(
      'file_account_mismatch',
      'Import file is already linked to a different account',
    );
  }
  return saved.preview;
}
