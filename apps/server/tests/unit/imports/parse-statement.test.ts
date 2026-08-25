import { describe, expect, it } from 'vitest';
import {
  IMPORT_LIMITS,
  ImportValidationError,
  parseStatementDrafts,
  type StatementTextExtractor,
} from '../../../src/imports';

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nsynthetic');

describe('parseStatementDrafts', () => {
  it('keeps an empty extraction result in explicit manual review', async () => {
    const extractor: StatementTextExtractor = { extract: async () => [] };

    await expect(parseStatementDrafts(pdfBytes, extractor)).resolves.toEqual([
      {
        candidate: null,
        decision: 'review_required',
        messages: ['No statement entries were extracted; manual review is required.'],
        sourceLocation: 'document',
      },
    ]);
  });

  it('keeps every extracted PDF entry in review with no normalized candidate', async () => {
    const extractor: StatementTextExtractor = {
      extract: async () => [{ page: 1, line: 4, text: 'Synthetic statement entry' }],
    };

    await expect(parseStatementDrafts(pdfBytes, extractor)).resolves.toEqual([
      {
        candidate: null,
        decision: 'review_required',
        messages: ['Review statement text: Synthetic statement entry'],
        sourceLocation: 'page 1, line 4',
      },
    ]);
  });

  it('rejects an extractor result that exceeds the bounded draft count', async () => {
    const extractor: StatementTextExtractor = {
      extract: async () =>
        Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, index) => ({
          page: 1,
          line: index + 1,
          text: `Synthetic statement entry ${index}`,
        })),
    };

    const result = parseStatementDrafts(pdfBytes, extractor);
    await expect(result).rejects.toBeInstanceOf(ImportValidationError);
    await expect(result).rejects.toMatchObject({ code: 'too_many_rows' });
  });

  it('rejects invalid line coordinates and overlong extracted text', async () => {
    const invalidLine: StatementTextExtractor = {
      extract: async () => [{ page: 1, line: 0, text: 'Synthetic statement entry' }],
    };
    const overlongText: StatementTextExtractor = {
      extract: async () => [
        { page: 1, line: 1, text: 'S'.repeat(IMPORT_LIMITS.maxCellCharacters + 1) },
      ],
    };

    await expect(parseStatementDrafts(pdfBytes, invalidLine)).rejects.toMatchObject({
      code: 'invalid_statement_location',
    });
    await expect(parseStatementDrafts(pdfBytes, overlongText)).rejects.toMatchObject({
      code: 'cell_too_large',
    });
  });
});
