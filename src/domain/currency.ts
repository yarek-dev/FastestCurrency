export type CurrencyProviderName = 'currency-beacon' | 'frankfurter'

export interface CurrencyConversion {
  amount: number
  base: string
  quote: string
}

export interface RateObservation {
  kind: 'timestamp' | 'date'
  value: string
}

export interface ExchangeQuote {
  base: string
  quote: string
  rate: number
  provider: CurrencyProviderName
  observedAt?: RateObservation
}

export interface ConversionResult extends ExchangeQuote {
  amount: number
  convertedAmount: number
}
