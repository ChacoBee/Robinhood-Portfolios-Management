import Decimal from 'decimal.js';

export type CurrencyCode = 'USD';

export interface Money {
  amount: string;
  currency: CurrencyCode;
}

export interface Ratio {
  value: string;
}

type DecimalInput = Decimal.Value;

function finiteDecimal(value: DecimalInput): Decimal {
  let parsed: Decimal;

  try {
    parsed = new Decimal(value);
  } catch {
    throw new TypeError('Expected a finite decimal value');
  }

  if (!parsed.isFinite()) {
    throw new TypeError('Expected a finite decimal value');
  }

  return parsed;
}

export function normalizeDecimal(value: DecimalInput): string {
  const parsed = finiteDecimal(value);
  return parsed.isZero() ? '0' : parsed.toFixed();
}

export function usd(amount: DecimalInput): Money {
  return { amount: normalizeDecimal(amount), currency: 'USD' };
}

export function ratio(value: DecimalInput): Ratio {
  return { value: normalizeDecimal(value) };
}

function decimalAmount(value: Money): Decimal {
  if (value.currency !== 'USD') {
    throw new TypeError('Only USD money is supported');
  }

  return finiteDecimal(value.amount);
}

export function addMoney(left: Money, right: Money): Money {
  return usd(decimalAmount(left).plus(decimalAmount(right)));
}

export function subtractMoney(left: Money, right: Money): Money {
  return usd(decimalAmount(left).minus(decimalAmount(right)));
}

export function multiplyMoney(value: Money, multiplier: DecimalInput): Money {
  return usd(decimalAmount(value).times(finiteDecimal(multiplier)));
}

export function absoluteMoney(value: Money): Money {
  return usd(decimalAmount(value).abs());
}

export function maxMoney(left: Money, right: Money): Money {
  return decimalAmount(left).gte(decimalAmount(right)) ? usd(left.amount) : usd(right.amount);
}

export function compareMoney(left: Money, right: Money): number {
  return decimalAmount(left).comparedTo(decimalAmount(right));
}

export function sumMoney(values: readonly Money[]): Money {
  return values.reduce((sum, value) => addMoney(sum, value), usd(0));
}

export function moneyRatio(numerator: Money, denominator: Money): Ratio | null {
  const denominatorDecimal = decimalAmount(denominator);
  if (denominatorDecimal.isZero()) return null;
  return ratio(decimalAmount(numerator).dividedBy(denominatorDecimal));
}
