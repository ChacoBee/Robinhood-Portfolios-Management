import { z } from 'zod';

const DecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const CursorSchema = z.string().min(1).nullable();

const PageSchema = <T extends z.ZodType>(row: T) =>
  z.object({ results: z.array(row.nullable()), next: CursorSchema }).strict();

export const ProviderAccountSchema = z
  .object({
    account_number: z.string().min(1),
    nickname: z.string().min(1).nullable().optional(),
    account_type: z.string().min(1).nullable().optional(),
    deactivated: z.boolean().optional(),
    closed: z.boolean().optional(),
  })
  .strict();

export const ProviderAccountsResponseSchema = z
  .object({ results: z.array(ProviderAccountSchema.nullable()) })
  .strict();

export const ProviderPortfolioResponseSchema = z
  .object({
    total_value: DecimalStringSchema.nullable(),
    cash: DecimalStringSchema.nullable(),
    accrued: DecimalStringSchema.nullable().optional(),
    buying_power: DecimalStringSchema.nullable().optional(),
    currency: CurrencySchema,
  })
  .strict();

export const ProviderEquityPositionSchema = z
  .object({
    symbol: z.string().min(1),
    quantity: DecimalStringSchema,
    average_buy_price: DecimalStringSchema.nullable(),
    currency: CurrencySchema,
    name: z.string().min(1).nullable().optional(),
    asset_class: z.string().min(1).nullable().optional(),
  })
  .strict();

export const ProviderEquityPositionsResponseSchema = PageSchema(
  ProviderEquityPositionSchema,
);

const ProviderEquityQuotePayloadSchema = z
  .object({
    last_trade_price: DecimalStringSchema.nullable(),
    last_trade_timestamp: z.string().datetime({ offset: true }).nullable(),
    last_extended_hours_trade_price: DecimalStringSchema.nullable(),
    last_extended_hours_trade_timestamp: z
      .string()
      .datetime({ offset: true })
      .nullable(),
    currency: CurrencySchema,
  })
  .strict();

export const ProviderQuoteSchema = z
  .object({ symbol: z.string().min(1), quote: ProviderEquityQuotePayloadSchema })
  .strict();

export const ProviderQuotesResponseSchema = z
  .object({ results: z.array(ProviderQuoteSchema.nullable()) })
  .strict();

export const ProviderOptionPositionSchema = z
  .object({
    option_id: z.string().min(1),
    symbol: z.string().min(1),
    quantity: DecimalStringSchema,
    currency: CurrencySchema,
  })
  .strict();

export const ProviderOptionPositionsResponseSchema = PageSchema(
  ProviderOptionPositionSchema,
);

export const ProviderOptionQuoteSchema = z
  .object({
    option_id: z.string().min(1),
    quote: z
      .object({ mark_price: DecimalStringSchema.nullable(), currency: CurrencySchema })
      .strict(),
  })
  .strict();
export const ProviderOptionQuotesResponseSchema = z
  .object({ results: z.array(ProviderOptionQuoteSchema.nullable()) })
  .strict();

export const ProviderOptionInstrumentSchema = z
  .object({
    option_id: z.string().min(1),
    trade_value_multiplier: DecimalStringSchema.nullable(),
    currency: CurrencySchema,
  })
  .strict();
export const ProviderOptionInstrumentsResponseSchema = z
  .object({ results: z.array(ProviderOptionInstrumentSchema.nullable()) })
  .strict();

export const PublicRefreshRequestSchema = z
  .object({ trigger: z.enum(['manual', 'page_load', 'heartbeat', 'scheduled']) })
  .strict();
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
