export type ApiControlErrorCode =
  | 'authentication_required'
  | 'authentication_unavailable'
  | 'authorization_denied'
  | 'recent_passkey_required'
  | 'csrf_invalid'
  | 'recovery_unavailable'
  | 'export_unavailable'
  | 'deletion_unavailable';

const publicMessages: Record<ApiControlErrorCode, string> = {
  authentication_required: 'Authentication is required.',
  authentication_unavailable: 'Connected authentication is unavailable.',
  authorization_denied: 'The authenticated identity is not authorized.',
  recent_passkey_required: 'A recently verified passkey is required.',
  csrf_invalid: 'The request could not be verified.',
  recovery_unavailable: 'Secure account recovery is not configured.',
  export_unavailable: 'Secure data export is not configured.',
  deletion_unavailable: 'Secure data deletion is not configured.',
};

export class ApiControlError extends Error {
  readonly publicMessage: string;

  constructor(
    readonly code: ApiControlErrorCode,
    readonly statusCode: 401 | 403 | 503,
  ) {
    super(code);
    this.name = 'ApiControlError';
    this.publicMessage = publicMessages[code];
  }
}
