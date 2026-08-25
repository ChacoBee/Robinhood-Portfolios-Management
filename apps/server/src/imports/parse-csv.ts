import { IMPORT_LIMITS, type CsvSourceRow } from './contracts';
import { ImportValidationError } from './detect-format';

const requiredHeaders = ['date', 'type', 'amount', 'description'] as const;

interface ParsedRecord {
  cells: string[];
  rowNumber: number;
}

function parseRecords(text: string): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let quoteClosed = false;
  let physicalLine = 1;
  let recordStartLine = 1;

  const pushCell = () => {
    if (record.length >= IMPORT_LIMITS.maxColumns) {
      throw new ImportValidationError(
        'too_many_columns',
        `CSV rows may contain at most ${IMPORT_LIMITS.maxColumns} columns`,
      );
    }
    record.push(cell);
    cell = '';
    quoteClosed = false;
  };

  const pushRecord = () => {
    pushCell();
    records.push({ cells: record, rowNumber: recordStartLine });
    record = [];
    if (records.length > IMPORT_LIMITS.maxRows + 1) {
      throw new ImportValidationError('too_many_rows', 'CSV exceeds the 5,000 row limit');
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        cell += character;
      }
      if (character === '\n') physicalLine += 1;
      if (cell.length > IMPORT_LIMITS.maxCellCharacters) {
        throw new ImportValidationError('cell_too_large', 'CSV cell exceeds the character limit');
      }
      continue;
    }

    if (quoteClosed) {
      if (character === ',') {
        pushCell();
      } else if (character === '\n') {
        pushRecord();
        physicalLine += 1;
        recordStartLine = physicalLine;
      } else if (character === '\r' && text[index + 1] === '\n') {
        continue;
      } else {
        throw new ImportValidationError(
          'malformed_csv',
          'CSV contains characters after a closing quote',
        );
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new ImportValidationError('malformed_csv', 'CSV contains an unexpected quote');
    } else if (character === ',') {
      pushCell();
    } else if (character === '\n') {
      if (cell.endsWith('\r')) cell = cell.slice(0, -1);
      pushRecord();
      physicalLine += 1;
      recordStartLine = physicalLine;
    } else {
      cell += character;
    }

    if (cell.length > IMPORT_LIMITS.maxCellCharacters) {
      throw new ImportValidationError('cell_too_large', 'CSV cell exceeds the character limit');
    }
  }

  if (quoted) {
    throw new ImportValidationError('malformed_csv', 'CSV contains an unterminated quoted field');
  }
  if (cell.length > 0 || record.length > 0 || quoteClosed) {
    if (!quoteClosed && cell.endsWith('\r')) cell = cell.slice(0, -1);
    pushRecord();
  }
  return records;
}

function beginsUnsafeFormula(value: string): boolean {
  const trimmed = value.trimStart();
  if (/^[=+@]/.test(trimmed)) return true;
  return /^-(?!\d+(?:\.\d+)?$)/.test(trimmed);
}

export function parseCsv(bytes: Uint8Array): CsvSourceRow[] {
  if (bytes.byteLength > IMPORT_LIMITS.maxBytes) {
    throw new ImportValidationError('file_too_large', 'Import file exceeds the 10 MB limit');
  }
  if (bytes.includes(0)) {
    throw new ImportValidationError('binary_csv', 'CSV must contain UTF-8 text');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ImportValidationError('invalid_utf8', 'CSV must be valid UTF-8');
  }
  text = text.replace(/^\uFEFF/, '');
  const records = parseRecords(text).filter((record) =>
    record.cells.some((cell) => cell.trim().length > 0),
  );
  if (records.length < 2) {
    throw new ImportValidationError('missing_rows', 'CSV requires a header and at least one row');
  }
  if (records.length - 1 > IMPORT_LIMITS.maxRows) {
    throw new ImportValidationError('too_many_rows', 'CSV exceeds the 5,000 row limit');
  }

  const rawHeaders = records[0]!.cells;
  rawHeaders.forEach((header, index) => {
    if (beginsUnsafeFormula(header)) {
      throw new ImportValidationError(
        'unsafe_formula',
        `Header cell ${index + 1} contains an unsafe spreadsheet formula`,
      );
    }
  });
  const headers = rawHeaders.map((header) => header.trim().toLowerCase());
  if (headers.some((header) => header.length === 0)) {
    throw new ImportValidationError('empty_header', 'CSV headers must not be empty');
  }
  if (new Set(headers).size !== headers.length) {
    throw new ImportValidationError('duplicate_headers', 'CSV headers must be unique');
  }
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new ImportValidationError('missing_header', `CSV is missing the ${required} header`);
    }
  }

  return records.slice(1).map((record) => {
    const { cells, rowNumber } = record;
    if (cells.length !== headers.length) {
      throw new ImportValidationError(
        'column_count',
        `Row ${rowNumber} has ${cells.length} columns; expected ${headers.length}`,
      );
    }
    const values: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      const value = cells[cellIndex]!.trim();
      if (beginsUnsafeFormula(value)) {
        throw new ImportValidationError(
          'unsafe_formula',
          `Row ${rowNumber}, column ${header} contains an unsafe spreadsheet formula`,
        );
      }
      values[header] = value;
    });
    return {
      rowNumber,
      values,
      canonical: headers.map((header) => `${header}=${JSON.stringify(values[header])}`).join('|'),
    };
  });
}
