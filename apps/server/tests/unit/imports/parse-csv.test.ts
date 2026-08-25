import { describe, expect, it } from 'vitest';
import {
  IMPORT_LIMITS,
  ImportValidationError,
  parseCsv,
  validateImportInput,
} from '../../../src/imports';

const encode = (value: string) => new TextEncoder().encode(value);

function expectValidationCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error('expected import validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).code).toBe(code);
  }
}

describe('parseCsv', () => {
  it('rejects spreadsheet formulas in data cells', () => {
    const csv = [
      'date,type,amount,description,transaction_id',
      '2026-08-01,deposit,10.00,"=HYPERLINK(""https://invalid.example"",""click"")",syn-formula-001',
    ].join('\n');

    expectValidationCode(() => parseCsv(encode(csv)), 'unsafe_formula');
  });

  it('rejects spreadsheet formulas in optional header cells', () => {
    const csv = [
      'date,type,amount,description,@unsafe',
      '2026-08-01,deposit,10.00,Synthetic funding,value',
    ].join('\n');

    expectValidationCode(() => parseCsv(encode(csv)), 'unsafe_formula');
  });

  it('enforces the byte limit when called directly', () => {
    expectValidationCode(
      () => parseCsv(new Uint8Array(IMPORT_LIMITS.maxBytes + 1)),
      'file_too_large',
    );
  });

  it('rejects binary NUL bytes when called directly', () => {
    const csv = encode('date,type,amount,description\n2026-08-01,deposit,10.00,Synthetic');
    const bytes = new Uint8Array(csv.length + 1);
    bytes.set(csv);

    expectValidationCode(() => parseCsv(bytes), 'binary_csv');
  });

  it('rejects characters after a closing quote instead of silently changing a value', () => {
    const csv = [
      'date,type,amount,description',
      '2026-08-01,deposit,10.00,"Synthetic"garbage',
    ].join('\n');

    expectValidationCode(() => parseCsv(encode(csv)), 'malformed_csv');
  });

  it('stops when the CSV exceeds the row limit', () => {
    const rows = Array.from(
      { length: IMPORT_LIMITS.maxRows + 1 },
      (_, index) => `2026-08-01,deposit,1.00,Synthetic ${index}`,
    );
    const csv = ['date,type,amount,description', ...rows].join('\n');

    expectValidationCode(() => parseCsv(encode(csv)), 'too_many_rows');
  });

  it('stops before a comma-heavy row can allocate unbounded columns', () => {
    const headers = ['date', 'type', 'amount', 'description', ...Array.from(
      { length: IMPORT_LIMITS.maxColumns - 3 },
      (_, index) => `optional_${index}`,
    )];
    const csv = [headers.join(','), headers.map(() => 'value').join(',')].join('\n');

    expectValidationCode(() => parseCsv(encode(csv)), 'too_many_columns');
  });

  it('preserves physical row numbers when blank lines precede a record', () => {
    const csv = [
      'date,type,amount,description',
      '',
      '2026-08-01,deposit,10.00,Synthetic funding',
    ].join('\n');

    expect(parseCsv(encode(csv))[0]?.rowNumber).toBe(3);
  });
});

describe('validateImportInput', () => {
  it('rejects an unsupported runtime media type with a closed error code', () => {
    expectValidationCode(
      () =>
        validateImportInput({
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'activity.txt',
          mediaType: 'text/plain' as never,
          bytes: encode('synthetic'),
        }),
      'unsupported_media_type',
    );
  });

  it('requires the declared extension and PDF magic bytes to agree', () => {
    expectValidationCode(
      () =>
        validateImportInput({
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'statement.pdf',
          mediaType: 'application/pdf',
          bytes: encode('not a PDF'),
        }),
      'magic_mismatch',
    );
    expectValidationCode(
      () =>
        validateImportInput({
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'statement.csv',
          mediaType: 'text/csv',
          bytes: encode('%PDF-1.7\n'),
        }),
      'magic_mismatch',
    );
  });
});
