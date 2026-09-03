import type { ExchangeQuote } from '../../domain/currency.js'

export type GetExchangeRate = (
  base: string,
  quote: string,
) => Promise<ExchangeQuote>
