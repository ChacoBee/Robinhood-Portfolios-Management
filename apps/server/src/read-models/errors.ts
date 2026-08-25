export type PublicApiErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'source_unavailable'
  | 'internal_error';

const publicMessages: Record<PublicApiErrorCode, string> = {
  invalid_request: 'The request is invalid.',
  not_found: 'The requested resource was not found.',
  source_unavailable: 'Portfolio data is temporarily unavailable.',
  internal_error: 'The request could not be completed.',
};

export class ReadModelSourceError extends Error {
  readonly publicMessage: string;

  constructor(
    readonly code: PublicApiErrorCode,
    readonly statusCode: 400 | 404 | 500 | 503,
  ) {
    super(code);
    this.name = 'ReadModelSourceError';
    this.publicMessage = publicMessages[code];
  }
}

export function publicErrorMessage(code: PublicApiErrorCode): string {
  return publicMessages[code];
}
