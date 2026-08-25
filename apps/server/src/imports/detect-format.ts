import { IMPORT_LIMITS, type ImportInput, type ImportMediaType } from './contracts';

export class ImportValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

const extensions: Record<ImportMediaType, string> = {
  'text/csv': '.csv',
  'application/pdf': '.pdf',
};

export function validateImportInput(input: ImportInput): void {
  if (input.bytes.byteLength === 0) {
    throw new ImportValidationError('empty_file', 'Import file is empty');
  }
  if (input.bytes.byteLength > IMPORT_LIMITS.maxBytes) {
    throw new ImportValidationError('file_too_large', 'Import file exceeds the 10 MB limit');
  }

  if (input.mediaType !== 'text/csv' && input.mediaType !== 'application/pdf') {
    throw new ImportValidationError(
      'unsupported_media_type',
      'Only CSV and PDF imports are supported',
    );
  }

  const expectedExtension = extensions[input.mediaType];
  if (!input.filename.toLowerCase().endsWith(expectedExtension)) {
    throw new ImportValidationError(
      'extension_mismatch',
      `Filename must end in ${expectedExtension}`,
    );
  }

  if (input.mediaType === 'application/pdf') {
    const magic = new TextDecoder('ascii').decode(input.bytes.slice(0, 5));
    if (magic !== '%PDF-') {
      throw new ImportValidationError('magic_mismatch', 'PDF magic bytes are missing');
    }
    return;
  }

  const magic = new TextDecoder('ascii').decode(input.bytes.slice(0, 5));
  if (magic === '%PDF-') {
    throw new ImportValidationError('magic_mismatch', 'CSV content does not match its media type');
  }
  if (input.bytes.includes(0)) {
    throw new ImportValidationError('binary_csv', 'CSV must contain UTF-8 text');
  }
}
