import { IMPORT_LIMITS, type ImportPreviewRow, type StatementTextExtractor } from './contracts';
import { ImportValidationError } from './detect-format';

export async function parseStatementDrafts(
  bytes: Uint8Array,
  extractor: StatementTextExtractor | undefined,
): Promise<ImportPreviewRow[]> {
  if (!extractor) {
    return [
      {
        candidate: null,
        decision: 'review_required',
        messages: ['PDF text extraction is not configured; no statement entries were imported.'],
        sourceLocation: 'document',
      },
    ];
  }
  const drafts = await extractor.extract(bytes, { maxPages: IMPORT_LIMITS.maxPages });
  if (drafts.length > IMPORT_LIMITS.maxRows) {
    throw new ImportValidationError(
      'too_many_rows',
      'Statement extraction exceeds the 5,000 entry limit',
    );
  }
  if (drafts.length === 0) {
    return [
      {
        candidate: null,
        decision: 'review_required',
        messages: ['No statement entries were extracted; manual review is required.'],
        sourceLocation: 'document',
      },
    ];
  }
  for (const draft of drafts) {
    if (
      !Number.isSafeInteger(draft.page) ||
      draft.page < 1 ||
      draft.page > IMPORT_LIMITS.maxPages ||
      !Number.isSafeInteger(draft.line) ||
      draft.line < 1
    ) {
      throw new ImportValidationError(
        'invalid_statement_location',
        'Statement extraction returned an invalid page or line',
      );
    }
    if (typeof draft.text !== 'string' || draft.text.trim().length === 0) {
      throw new ImportValidationError(
        'invalid_statement_text',
        'Statement extraction returned empty text',
      );
    }
    if (draft.text.length > IMPORT_LIMITS.maxCellCharacters) {
      throw new ImportValidationError(
        'cell_too_large',
        'Statement entry exceeds the character limit',
      );
    }
  }
  return drafts.map((draft) => ({
    candidate: null,
    decision: 'review_required',
    messages: [`Review statement text: ${draft.text.slice(0, 160)}`],
    sourceLocation: `page ${draft.page}, line ${draft.line}`,
  }));
}
