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
  previousRate: number
  changePercent: number
}

export type ChangePeriodDays = 3 | 7 | 14 | 30

export interface PeriodChangeRequest {
  base: string
  quote: string
  currentRate: number
  provider: CurrencyProviderName
  days: ChangePeriodDays
  referenceDate?: Date
}

export interface PeriodChangeResult extends PeriodChangeRequest {
  referenceDate: Date
  historicalRate: number
  changePercent: number
  historicalObservedAt?: RateObservation
}
