import type { z } from 'zod';

export const providerFailureCodes = [
  'provider_timeout',
  'provider_http_error',
  'provider_protocol_error',
  'provider_schema_drift',
  'provider_reference_invalid',
  'provider_scope_invalid',
  'provider_authorization_invalid',
] as const;

export type ProviderFailureCode = (typeof providerFailureCodes)[number];

export class ProviderBoundaryError extends Error {
  constructor(readonly code: ProviderFailureCode) {
    super(code);
    this.name = 'ProviderBoundaryError';
  }
}

export function parseProvider<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderBoundaryError('provider_schema_drift');
  }
  return parsed.data;
}
