import { normalizeDecimal, usd, type TransactionKind } from '@aurum/domain';
import type { CsvSourceRow, ImportCandidate } from './contracts';
import { sha256, transactionFingerprint } from './fingerprint';

const parserVersion = 'csv-v1';
const mappingVersion = 'robinhood-activity-v1';

const kindAliases: Record<string, TransactionKind> = {
  deposit: 'deposit',
  withdrawal: 'withdrawal',
  dividend: 'dividend',
  interest: 'interest',
  fee: 'fee',
  trade: 'trade',
  buy: 'trade',
  sell: 'trade',
  transfer: 'internal_transfer',
  'corporate action': 'corporate_action',
};

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  let parseable: string;
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    parseable = `${year}-${month}-${day}T12:00:00.000Z`;
    if (!validCalendarDate(Number(year), Number(month), Number(day))) {
      throw new TypeError('invalid date');
    }
    const parsed = new Date(parseable);
    if (Number.isNaN(parsed.valueOf())) throw new TypeError('invalid date');
    return parsed.toISOString();
  }
  const timestampMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      trimmed,
    );
  if (!timestampMatch) {
    throw new TypeError('invalid date');
  }
  const [, year, month, day, hour, minute, second] = timestampMatch;
  if (
    !validCalendarDate(Number(year), Number(month), Number(day)) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    throw new TypeError('invalid date');
  }
  parseable = trimmed;
  const parsed = new Date(parseable);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError('invalid date');
  return parsed.toISOString();
}

function normalizeMoney(value: string): string {
  const withoutCurrency = value.trim().replace(/^\$/, '');
  if (
    !/^-?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/.test(withoutCurrency)
  ) {
    throw new TypeError('invalid money');
  }
  const stripped = withoutCurrency.replaceAll(',', '');
  return normalizeDecimal(stripped);
}

export function normalizeCsvTransaction(
  row: CsvSourceRow,
  accountId: string,
  sourceFileSha256: string,
): ImportCandidate {
  if (!/^[a-f0-9]{64}$/.test(sourceFileSha256)) throw new TypeError('invalid source file hash');
  const type = row.values.type?.toLowerCase() ?? '';
  const kind = kindAliases[type];
  if (!kind) throw new TypeError(`unknown event type: ${row.values.type ?? ''}`);
  const effectiveAt = normalizeDate(row.values.date ?? '');
  const amount = normalizeMoney(row.values.amount ?? '');
  const description = (row.values.description ?? '').trim();
  if (!description) throw new TypeError('description is required');
  const sourceTransactionId = row.values.transaction_id?.trim() || null;
  const source = 'robinhood';
  const rawChecksum = sha256(row.canonical);
  const sourceFingerprint = transactionFingerprint({
    source,
    accountId,
    sourceTransactionId,
    effectiveAt,
    kind,
    amount,
    description,
    sourceLineage: `csv:${sourceFileSha256}:row:${row.rowNumber}:raw:${rawChecksum}`,
  });
  return {
    id: `candidate_${sourceFingerprint.slice(0, 24)}`,
    source,
    accountId,
    kind,
    amount: usd(amount),
    effectiveAt,
    description,
    sourceTransactionId,
    sourceFingerprint,
    sourceLocation: `row ${row.rowNumber}`,
    rawChecksum,
    parserVersion,
    mappingVersion,
  };
}

export const CSV_PARSER_VERSION = parserVersion;
export const CSV_MAPPING_VERSION = mappingVersion;
