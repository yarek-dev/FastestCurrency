import type { GetExchangeRate } from '../ports/exchange-rate-provider.js'
import type {
  CurrencyProviderName,
  PeriodChangeRequest,
  PeriodChangeResult,
} from '../../domain/currency.js'
import { createProviderUnavailableError } from '../../domain/errors.js'

export type GetPeriodChange = (
  input: PeriodChangeRequest,
) => Promise<PeriodChangeResult>

type Providers = Partial<Record<CurrencyProviderName, GetExchangeRate>>

export function createGetPeriodChange(
  providers: Providers,
  now: () => Date = () => new Date(),
): GetPeriodChange {
  return async (input) => {
    const getExchangeRate = providers[input.provider]

    if (!getExchangeRate) {
      throw createProviderUnavailableError(
        input.provider,
        `${input.provider} is not configured`,
      )
    }

    const referenceDate = new Date(input.referenceDate ?? now())
    const historicalDate = new Date(referenceDate)
    historicalDate.setUTCDate(historicalDate.getUTCDate() - input.days)

    const historical = await getExchangeRate(
      input.base,
      input.quote,
      historicalDate.toISOString().slice(0, 10),
    )

    return {
      ...input,
      referenceDate,
      historicalRate: historical.rate,
      changePercent: (input.currentRate / historical.rate - 1) * 100,
      ...(historical.observedAt
        ? { historicalObservedAt: historical.observedAt }
        : {}),
    }
  }
}
