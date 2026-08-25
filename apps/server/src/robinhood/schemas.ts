import { z } from 'zod';

const DecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const TimestampSchema = z.string().datetime({ offset: true });
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const MarketStateSchema = z.enum(['regular', 'extended', 'closed', 'unknown']);

export const ProviderAccountSchema = z
  .object({
    account_id: z.string().min(1),
    account_number: z.string().min(1).nullable().optional(),
    display_name: z.string().min(1),
    status: z.enum(['active', 'closed']),
    total_kind: z.enum([
      'provider_portfolio_value',
      'net_liquidation_value',
      'account_equity',
      'unknown',
    ]),
    source_as_of: TimestampSchema,
  })
  .strict();

export const ProviderAccountsResponseSchema = z
  .object({ accounts: z.array(ProviderAccountSchema) })
  .strict();

export const ProviderPortfolioResponseSchema = z
  .object({
    account_id: z.string().min(1),
    total_value: DecimalStringSchema.nullable(),
    cash: DecimalStringSchema.nullable(),
    accrued: DecimalStringSchema.nullable(),
    currency: CurrencySchema,
    source_as_of: TimestampSchema,
  })
  .strict();

export const ProviderEquityPositionSchema = z
  .object({
    account_id: z.string().min(1),
    instrument_id: z.string().min(1),
    symbol: z.string().min(1),
    name: z.string().min(1),
    asset_class: z.string().min(1),
    quantity: DecimalStringSchema,
    market_value: DecimalStringSchema.nullable(),
    cost_basis: DecimalStringSchema.nullable(),
    cost_basis_source: z.enum([
      'provider_average',
      'calculated_complete',
      'calculated_partial',
      'unavailable',
    ]),
    currency: CurrencySchema,
    source_as_of: TimestampSchema,
  })
  .strict();

export const ProviderEquityPositionsResponseSchema = z
  .object({ positions: z.array(ProviderEquityPositionSchema) })
  .strict();

export const ProviderQuoteSchema = z
  .object({
    instrument_id: z.string().min(1),
    symbol: z.string().min(1),
    price: DecimalStringSchema,
    currency: CurrencySchema,
    market_state: MarketStateSchema,
    source_as_of: TimestampSchema,
  })
  .strict();

export const ProviderQuotesResponseSchema = z
  .object({ quotes: z.array(ProviderQuoteSchema) })
  .strict();

export const ProviderOptionPositionSchema = z
  .object({
    account_id: z.string().min(1),
    option_id: z.string().min(1),
    symbol: z.string().min(1),
    quantity: DecimalStringSchema,
    market_value: DecimalStringSchema.nullable(),
    currency: CurrencySchema,
    source_as_of: TimestampSchema,
  })
  .strict();

export const ProviderOptionPositionsResponseSchema = z
  .object({ positions: z.array(ProviderOptionPositionSchema) })
  .strict();

export const ProviderOrderSchema = z
  .object({
    order_id: z.string().min(1),
    account_id: z.string().min(1),
    asset_type: z.enum(['equity', 'option']),
    state: z.string().min(1),
    side: z.string().min(1),
    quantity: DecimalStringSchema,
    created_at: TimestampSchema,
  })
  .strict();

export const ProviderOrdersResponseSchema = z
  .object({ orders: z.array(ProviderOrderSchema) })
  .strict();

export const ProviderTaxLotSchema = z
  .object({
    lot_id: z.string().min(1),
    account_id: z.string().min(1),
    instrument_id: z.string().min(1),
    quantity: DecimalStringSchema,
    cost_basis: DecimalStringSchema.nullable(),
    currency: CurrencySchema,
    acquired_at: TimestampSchema.nullable(),
  })
  .strict();

export const ProviderTaxLotsResponseSchema = z
  .object({ lots: z.array(ProviderTaxLotSchema) })
  .strict();

export const ProviderRealizedPnlResponseSchema = z
  .object({
    account_id: z.string().min(1),
    amount: DecimalStringSchema.nullable(),
    currency: CurrencySchema,
    method: z.string().min(1).nullable(),
    source_as_of: TimestampSchema,
  })
  .strict();

export const ProviderPnlTradeHistoryResponseSchema = z
  .object({
    trades: z.array(
      z
        .object({
          trade_id: z.string().min(1),
          account_id: z.string().min(1),
          symbol: z.string().min(1),
          amount: DecimalStringSchema.nullable(),
          currency: CurrencySchema,
          executed_at: TimestampSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const PublicRefreshRequestSchema = z
  .object({
    trigger: z.enum(['manual', 'page_load', 'heartbeat', 'scheduled']),
  })
  .strict();

export const PublicDisconnectRequestSchema = z
  .object({ confirm: z.literal(true) })
  .strict();

export const PublicRefreshRequestJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['trigger'],
  properties: {
    trigger: {
      type: 'string',
      enum: ['manual', 'page_load', 'heartbeat', 'scheduled'],
    },
  },
} as const;

export const PublicDisconnectRequestJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirm'],
  properties: { confirm: { const: true } },
} as const;

export type ProviderAccount = z.infer<typeof ProviderAccountSchema>;
export type ProviderPortfolioResponse = z.infer<
  typeof ProviderPortfolioResponseSchema
>;
export type ProviderEquityPosition = z.infer<typeof ProviderEquityPositionSchema>;
export type ProviderQuote = z.infer<typeof ProviderQuoteSchema>;
export type ProviderOptionPosition = z.infer<typeof ProviderOptionPositionSchema>;
export type ProviderOrder = z.infer<typeof ProviderOrderSchema>;
export type ProviderTaxLot = z.infer<typeof ProviderTaxLotSchema>;
export type ProviderRealizedPnlResponse = z.infer<
  typeof ProviderRealizedPnlResponseSchema
>;
export type ProviderPnlTrade = z.infer<
  typeof ProviderPnlTradeHistoryResponseSchema
>['trades'][number];
