const sensitiveKey = /(?:authorization|cookie|token|secret|password|credential|account(?:_|-)?number|provider(?:_|-)?payload|raw(?:_|-)?payload)/i;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const accountLike = /\b\d{8,17}\b/g;

export const REDACTED = '[REDACTED]';

export function redactText(value: string): string {
  return value.replace(bearer, `Bearer ${REDACTED}`).replace(accountLike, REDACTED);
}

export function redactStructured(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactStructured(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveKey.test(key) ? REDACTED : redactStructured(nested, seen),
    ]),
  );
}

export function safeError(error: unknown): { name: string; message: string } {
  if (!(error instanceof Error)) return { name: 'Error', message: 'Unknown error' };
  return { name: error.name, message: redactText(error.message) };
}
