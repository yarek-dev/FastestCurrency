import type {
  ConversionResult,
  CurrencyConversion,
} from '../../domain/currency.js'
import type { GetExchangeRatePair } from '../ports/exchange-rate-provider.js'

export type ConvertCurrency = (
  input: CurrencyConversion,
) => Promise<ConversionResult>

export function createConvertCurrency(
  getExchangeRatePair: GetExchangeRatePair,
  now: () => Date = () => new Date(),
): ConvertCurrency {
  return async (input) => {
    const previousDate = new Date(now())
    previousDate.setUTCDate(previousDate.getUTCDate() - 1)
    const { current, previous } = await getExchangeRatePair(
      input.base,
      input.quote,
      previousDate.toISOString().slice(0, 10),
    )

    return {
      ...current,
      amount: input.amount,
      convertedAmount: input.amount * current.rate,
      previousRate: previous.rate,
      changePercent: (current.rate / previous.rate - 1) * 100,
    }
  }
}
