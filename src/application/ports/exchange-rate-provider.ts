import type { ExchangeQuote } from '../../domain/currency.js'

export type GetExchangeRate = (
  base: string,
  quote: string,
  date?: string,
  signal?: AbortSignal,
) => Promise<ExchangeQuote>

export interface ExchangeRatePair {
  current: ExchangeQuote
  previous: ExchangeQuote
}

export type GetExchangeRatePair = (
  base: string,
  quote: string,
  previousDate: string,
) => Promise<ExchangeRatePair>
