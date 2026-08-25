import type { MarketSessionWindow } from './schedule-policy';
import type { ValuationSessionPhase } from './freshness-policy';

const NEW_YORK = 'America/New_York';
const localFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NEW_YORK,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface UsEquitySessionContext {
  phase: ValuationSessionPhase;
  lastRegularCloseAt: string;
  scheduleWindow: MarketSessionWindow;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function fromDateKey(value: string): CalendarDate {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) throw new Error('invalid_market_date');
  return { year, month, day };
}

function utcCalendarDate(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const value = utcCalendarDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function weekday(date: CalendarDate): number {
  return utcCalendarDate(date).getUTCDay();
}

function nthWeekday(
  year: number,
  month: number,
  targetWeekday: number,
  ordinal: number,
): CalendarDate {
  const first = { year, month, day: 1 };
  const offset = (targetWeekday - weekday(first) + 7) % 7;
  return { year, month, day: 1 + offset + (ordinal - 1) * 7 };
}

function lastWeekday(
  year: number,
  month: number,
  targetWeekday: number,
): CalendarDate {
  const firstNextMonth =
    month === 12
      ? { year: year + 1, month: 1, day: 1 }
      : { year, month: month + 1, day: 1 };
  let result = addDays(firstNextMonth, -1);
  while (weekday(result) !== targetWeekday) result = addDays(result, -1);
  return result;
}

function observedFixed(date: CalendarDate): CalendarDate | null {
  const day = weekday(date);
  if (day === 6) return addDays(date, -1);
  if (day === 0) return addDays(date, 1);
  return date;
}

function observedNewYear(date: CalendarDate): CalendarDate | null {
  const day = weekday(date);
  if (day === 6) return null;
  if (day === 0) return addDays(date, 1);
  return date;
}

function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function holidays(year: number): Set<string> {
  const values = [
    observedNewYear({ year, month: 1, day: 1 }),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    addDays(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    year >= 2022 ? observedFixed({ year, month: 6, day: 19 }) : null,
    observedFixed({ year, month: 7, day: 4 }),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixed({ year, month: 12, day: 25 }),
    observedNewYear({ year: year + 1, month: 1, day: 1 }),
  ];
  return new Set(values.filter(Boolean).map((value) => dateKey(value!)));
}

function isTradingDay(date: CalendarDate): boolean {
  const day = weekday(date);
  return day !== 0 && day !== 6 && !holidays(date.year).has(dateKey(date));
}

function thanksgiving(year: number): CalendarDate {
  return nthWeekday(year, 11, 4, 4);
}

function isEarlyClose(date: CalendarDate): boolean {
  const key = dateKey(date);
  const dayAfterThanksgiving = dateKey(addDays(thanksgiving(date.year), 1));
  if (key === dayAfterThanksgiving) return true;
  if (date.month === 12 && date.day === 24 && isTradingDay(date)) return true;
  if (date.month === 7 && date.day === 3 && isTradingDay(date)) return true;
  return false;
}

function dstOffsetHours(date: CalendarDate): -5 | -4 {
  const secondSundayMarch = nthWeekday(date.year, 3, 0, 2);
  const firstSundayNovember = nthWeekday(date.year, 11, 0, 1);
  const key = dateKey(date);
  return key >= dateKey(secondSundayMarch) && key < dateKey(firstSundayNovember)
    ? -4
    : -5;
}

function localToUtc(date: CalendarDate, hour: number, minute = 0): string {
  const offset = dstOffsetHours(date);
  return new Date(
    Date.UTC(date.year, date.month - 1, date.day, hour - offset, minute),
  ).toISOString();
}

function localNow(now: Date): CalendarDate & { hour: number; minute: number } {
  const parts = Object.fromEntries(
    localFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
  };
}

function previousTradingDate(date: CalendarDate): CalendarDate {
  let candidate = addDays(date, -1);
  while (!isTradingDay(candidate)) candidate = addDays(candidate, -1);
  return candidate;
}

export function resolveUsEquitySession(now: Date): UsEquitySessionContext {
  const local = localNow(now);
  const date = { year: local.year, month: local.month, day: local.day };
  const tradingDay = isTradingDay(date);
  const closeHour = isEarlyClose(date) ? 13 : 16;
  const minutes = local.hour * 60 + local.minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = closeHour * 60;
  const phase: ValuationSessionPhase = !tradingDay
    ? 'holiday'
    : minutes >= openMinutes && minutes < closeMinutes
      ? 'regular'
      : (minutes >= 7 * 60 && minutes < openMinutes) ||
          (minutes >= closeMinutes && minutes < 20 * 60)
        ? 'extended'
        : 'closed';

  const lastCloseDate =
    tradingDay && minutes >= closeMinutes ? date : previousTradingDate(date);
  const lastCloseHour = isEarlyClose(lastCloseDate) ? 13 : 16;
  const weekend = weekday(date) === 0 || weekday(date) === 6;

  return {
    phase,
    lastRegularCloseAt: localToUtc(lastCloseDate, lastCloseHour),
    scheduleWindow: {
      kind: tradingDay ? 'regular' : weekend ? 'closed' : 'holiday',
      tradingDate: dateKey(date),
      openAt: tradingDay ? localToUtc(date, 9, 30) : null,
      closeAt: tradingDay ? localToUtc(date, closeHour) : null,
      halfDay: tradingDay && isEarlyClose(date),
    },
  };
}

export function marketDateFromKey(value: string): CalendarDate {
  return fromDateKey(value);
}
