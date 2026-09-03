import type { GetExchangeRate } from '../../application/ports/exchange-rate-provider.js'
import type { ExchangeQuote, RateObservation } from '../../domain/currency.js'
import {
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
} from '../../domain/errors.js'

const PROVIDER = 'frankfurter'
const API_URL = 'https://api.frankfurter.dev/v1/latest'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseObservation(value: unknown): RateObservation | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }

  return { kind: 'date', value }
}

export function createFrankfurterProvider(timeoutMs = 3_000): GetExchangeRate {
  return async (base, quote): Promise<ExchangeQuote> => {
    const validationQuote = base === quote
      ? (base === 'USD' ? 'EUR' : 'USD')
      : quote
    const url = new URL(API_URL)

    url.searchParams.set('base', base)
    url.searchParams.set('symbols', validationQuote)

    let response: Response
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw createProviderUnavailableError(
        PROVIDER,
        'Frankfurter request failed',
        { cause: error },
      )
    }

    if ([400, 404, 422].includes(response.status)) {
      throw createUnsupportedCurrencyError([...new Set([base, quote])])
    }

    if (!response.ok) {
      throw createProviderUnavailableError(
        PROVIDER,
        `Frankfurter returned status ${response.status}`,
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      throw createProviderUnavailableError(
        PROVIDER,
        'Frankfurter returned invalid JSON',
        { cause: error },
      )
    }

    if (!isRecord(payload) || !isRecord(payload.rates)) {
      throw createProviderUnavailableError(
        PROVIDER,
        'Frankfurter response has an invalid structure',
      )
    }

    const rateValue = payload.rates[validationQuote]
    if (typeof rateValue !== 'number' || !Number.isFinite(rateValue) || rateValue <= 0) {
      throw createUnsupportedCurrencyError([...new Set([base, quote])])
    }

    const observedAt = parseObservation(payload.date)

    return {
      base,
      quote,
      rate: base === quote ? 1 : rateValue,
      provider: PROVIDER,
      ...(observedAt ? { observedAt } : {}),
    }
  }
}
