import { z } from 'zod';

const DecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const TimestampSchema = z.string().datetime({ offset: true });
const nullableDecimal = DecimalStringSchema.nullable();

export const ProviderAccountSchema = z.object({
  account_number: z.string().min(1), rhs_account_number: z.string().min(1),
  type: z.string().min(1), brokerage_account_type: z.string().min(1),
  is_default: z.boolean(), agentic_allowed: z.boolean(), option_level: z.string(),
  state: z.string().min(1), deactivated: z.boolean(), permanently_deactivated: z.boolean(),
  rhc_account_number: z.string().min(1).nullable().optional(),
  unsettled_funds: nullableDecimal.optional(), nickname: z.string().min(1).nullable().optional(),
  management_type: z.string().min(1).nullable().optional(), affiliate: z.string().min(1).nullable().optional(),
}).strict();
export const ProviderAccountsResponseSchema = z.object({ accounts: z.array(ProviderAccountSchema.nullable()).nullable() }).strict();

const ProviderBuyingPowerSchema = z.object({
  buying_power: nullableDecimal, unleveraged_buying_power: nullableDecimal, display_currency: CurrencySchema,
  intraday_buying_power: nullableDecimal.optional(), off_intraday_buying_power: nullableDecimal.optional(),
}).strict();
export const ProviderPortfolioResponseSchema = z.object({
  total_value: nullableDecimal, equity_value: nullableDecimal, options_value: nullableDecimal,
  futures_value: nullableDecimal, event_contracts_value: nullableDecimal, crypto_value: nullableDecimal,
  cash: nullableDecimal, pending_deposits: nullableDecimal, mutual_funds_value: nullableDecimal,
  fixed_income_value: nullableDecimal, currency: CurrencySchema, buying_power: ProviderBuyingPowerSchema.nullable(),
}).strict();

export const ProviderEquityPositionSchema = z.object({
  symbol: z.string().min(1), quantity: DecimalStringSchema, intraday_quantity: DecimalStringSchema,
  shares_available_for_sells: DecimalStringSchema, shares_held_for_sells: DecimalStringSchema,
  shares_held_for_stock_grants: DecimalStringSchema, shares_held_for_options_events: DecimalStringSchema,
  shares_held_for_asset_transfer: DecimalStringSchema, shares_pending_from_options_events: DecimalStringSchema,
  type: z.string().min(1), average_buy_price: nullableDecimal.optional(),
}).strict();
export const ProviderEquityPositionsResponseSchema = z.object({
  positions: z.array(ProviderEquityPositionSchema.nullable()).nullable(), next: z.string().url().optional(),
}).strict();

const ProviderEquityQuotePayloadSchema = z.object({
  symbol: z.string().min(1), last_trade_price: DecimalStringSchema, venue_last_trade_time: TimestampSchema,
  last_non_reg_trade_price: nullableDecimal, venue_last_non_reg_trade_time: TimestampSchema.nullable(),
  adjusted_previous_close: DecimalStringSchema, previous_close: DecimalStringSchema,
  previous_close_date: z.string().min(1).nullable(), bid_price: DecimalStringSchema,
  venue_bid_time: TimestampSchema, ask_price: DecimalStringSchema, venue_ask_time: TimestampSchema,
  has_traded: z.boolean(), state: z.string().min(1),
}).strict();
const ProviderEquityCloseSchema = z.object({
  symbol: z.string().min(1), date: z.string().nullable(), price: z.string().nullable(),
  interpolated: z.boolean().nullable(), source: z.string().nullable(),
}).strict();
export const ProviderQuoteSchema = z.object({ quote: ProviderEquityQuotePayloadSchema, close: ProviderEquityCloseSchema.nullable().optional() }).strict();
export const ProviderQuotesResponseSchema = z.object({ results: z.array(ProviderQuoteSchema.nullable()).nullable() }).strict();

export const ProviderOptionPositionSchema = z.object({
  option_id: z.string().min(1), chain_id: z.string().min(1), chain_symbol: z.string().min(1), type: z.string().min(1),
  quantity: DecimalStringSchema, average_price: nullableDecimal, expiration_date: z.string().min(1),
  trade_value_multiplier: DecimalStringSchema, intraday_average_open_price: nullableDecimal,
  intraday_quantity: DecimalStringSchema, pending_buy_quantity: DecimalStringSchema,
  pending_sell_quantity: DecimalStringSchema, pending_assignment_quantity: DecimalStringSchema,
  pending_exercise_quantity: DecimalStringSchema, pending_expiration_quantity: DecimalStringSchema,
  opened_at: TimestampSchema.optional(),
}).strict();
export const ProviderOptionPositionsResponseSchema = z.object({
  positions: z.array(ProviderOptionPositionSchema.nullable()).nullable(), next: z.string().url().optional(),
}).strict();

const ProviderOptionQuotePayloadSchema = z.object({
  instrument_id: z.string().min(1), ask_price: DecimalStringSchema, ask_size: z.number().int(),
  bid_price: DecimalStringSchema, bid_size: z.number().int(), break_even_price: DecimalStringSchema,
  adjusted_mark_price: DecimalStringSchema, mark_price: DecimalStringSchema,
  high_fill_rate_buy_price: DecimalStringSchema, low_fill_rate_buy_price: DecimalStringSchema,
  high_fill_rate_sell_price: DecimalStringSchema, low_fill_rate_sell_price: DecimalStringSchema,
  previous_close_price: DecimalStringSchema, previous_close_date: z.string().min(1),
  implied_volatility: z.string().nullable(), delta: z.string().nullable(), gamma: z.string().nullable(),
  rho: z.string().nullable(), theta: z.string().nullable(), vega: z.string().nullable(),
  open_interest: z.number().int(), volume: z.number().int(), chance_of_profit_long: z.string().nullable(),
  chance_of_profit_short: z.string().nullable(), updated_at: TimestampSchema,
}).strict();
const ProviderOptionCloseSchema = z.object({
  instrument_id: z.string().min(1), symbol: z.string().min(1), date: z.string().nullable(),
  price: z.string().nullable(), interpolated: z.boolean().nullable(), source: z.string().nullable(),
}).strict();
export const ProviderOptionQuoteSchema = z.object({ quote: ProviderOptionQuotePayloadSchema, close: ProviderOptionCloseSchema.nullable().optional() }).strict();
export const ProviderOptionQuotesResponseSchema = z.object({ results: z.array(ProviderOptionQuoteSchema.nullable()).nullable() }).strict();

export const ProviderOptionInstrumentSchema = z.object({
  id: z.string().min(1), chain_id: z.string().min(1), chain_symbol: z.string().min(1),
  underlying_type: z.string().min(1), expiration_date: z.string().min(1), sellout_datetime: TimestampSchema,
  strike_price: DecimalStringSchema, type: z.string().min(1), state: z.string().min(1),
  tradability: z.string().min(1), trade_value_multiplier: DecimalStringSchema,
  min_ticks: z.object({
    above_tick: DecimalStringSchema, below_tick: DecimalStringSchema, cutoff_price: DecimalStringSchema,
  }).strict(),
}).strict();
export const ProviderOptionInstrumentsResponseSchema = z.object({
  instruments: z.array(ProviderOptionInstrumentSchema.nullable()).nullable(), next: z.string().url().optional(),
}).strict();

export const PublicRefreshRequestSchema = z.object({ trigger: z.enum(['manual', 'page_load', 'heartbeat', 'scheduled']) }).strict();
export const PublicDisconnectRequestSchema = z.object({ confirm: z.literal(true) }).strict();
export const PublicRefreshRequestJsonSchema = { type: 'object', additionalProperties: false, required: ['trigger'], properties: { trigger: { type: 'string', enum: ['manual', 'page_load', 'heartbeat', 'scheduled'] } } } as const;
export const PublicDisconnectRequestJsonSchema = { type: 'object', additionalProperties: false, required: ['confirm'], properties: { confirm: { const: true } } } as const;

export type ProviderAccount = z.infer<typeof ProviderAccountSchema>;
export type ProviderPortfolioResponse = z.infer<typeof ProviderPortfolioResponseSchema>;
export type ProviderEquityPosition = z.infer<typeof ProviderEquityPositionSchema>;
export type ProviderQuote = z.infer<typeof ProviderQuoteSchema>;
export type ProviderOptionPosition = z.infer<typeof ProviderOptionPositionSchema>;
export type ProviderOptionQuote = z.infer<typeof ProviderOptionQuoteSchema>;
export type ProviderOptionInstrument = z.infer<typeof ProviderOptionInstrumentSchema>;
