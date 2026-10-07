import type {
  ConversionResult,
  CurrencyConversion,
} from '@backend/supabase/functions/telegram-webhook/domain/currency.ts'
import type { GetExchangeRatePair } from '@backend/supabase/functions/telegram-webhook/application/ports/exchange-rate-provider.ts'

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
