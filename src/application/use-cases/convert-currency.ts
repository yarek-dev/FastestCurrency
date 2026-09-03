import type {
  ConversionResult,
  CurrencyConversion,
} from '../../domain/currency.js'
import type { GetExchangeRate } from '../ports/exchange-rate-provider.js'

export type ConvertCurrency = (
  input: CurrencyConversion,
) => Promise<ConversionResult>

export function createConvertCurrency(
  getExchangeRate: GetExchangeRate,
): ConvertCurrency {
  return async (input) => {
    const quote = await getExchangeRate(input.base, input.quote)

    return {
      ...quote,
      amount: input.amount,
      convertedAmount: input.amount * quote.rate,
    }
  }
}
