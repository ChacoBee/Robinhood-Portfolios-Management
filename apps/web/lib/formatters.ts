import type { Money, Ratio } from '@aurum/domain';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 1, maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export type ValueDirection = 'positive' | 'negative' | 'neutral';

function signedPrefix(value: number, enabled: boolean) {
  return enabled && value > 0 ? '+' : '';
}

export function formatMoney(money: Money | null, options: { sign?: boolean } = {}): string {
  if (!money) return 'Unavailable';
  const value = Number(money.amount);
  if (!Number.isFinite(value)) return 'Unavailable';
  return `${signedPrefix(value, options.sign === true)}${currencyFormatter.format(value)}`;
}

export function formatCompactMoney(money: Money | null): string {
  if (!money) return 'Unavailable';
  const value = Number(money.amount);
  return Number.isFinite(value) ? compactCurrencyFormatter.format(value) : 'Unavailable';
}

export function formatRatio(value: Ratio | null, options: { sign?: boolean } = {}): string {
  if (!value) return 'Unavailable';
  const parsed = Number(value.value);
  if (!Number.isFinite(parsed)) return 'Unavailable';
  return `${signedPrefix(parsed, options.sign === true)}${percentFormatter.format(parsed)}`;
}

export function valueDirection(value: Money | Ratio | null): ValueDirection {
  if (!value) return 'neutral';
  const parsed = Number('amount' in value ? value.amount : value.value);
  if (!Number.isFinite(parsed) || parsed === 0) return 'neutral';
  return parsed > 0 ? 'positive' : 'negative';
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'Timestamp unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Timestamp unavailable';
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short',
  }).format(date);
  return formatted.replace(/EDT|EST/, 'ET');
}

export function formatQuantity(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(parsed);
}
