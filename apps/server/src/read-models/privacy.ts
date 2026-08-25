const forbiddenNormalizedKeys = new Set([
  'accountnumber',
  'provideraccountkey',
  'provideraccountref',
  'providerinstrumentref',
  'provideroptionkey',
  'authorization',
  'bearer',
  'bearertoken',
  'accesstoken',
  'refreshtoken',
  'token',
  'secret',
  'cookie',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll('_', '').replaceAll('-', '');
}

export function assertPublicPayloadSafe(value: unknown): void {
  const visited = new WeakSet<object>();

  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') return;
    if (visited.has(candidate)) return;
    visited.add(candidate);

    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    for (const [key, nested] of Object.entries(candidate)) {
      if (forbiddenNormalizedKeys.has(normalizedKey(key))) {
        throw new Error('private_response_field_blocked');
      }
      visit(nested);
    }
  };

  visit(value);
}
