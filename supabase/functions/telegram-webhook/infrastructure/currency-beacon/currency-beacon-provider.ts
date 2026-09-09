import type { GetExchangeRate } from '../../application/ports/exchange-rate-provider.ts'
import type { ExchangeQuote, RateObservation } from '../../domain/currency.ts'
import {
  createProviderConfigurationError,
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
} from '../../domain/errors.ts'

const PROVIDER = 'currency-beacon'
const API_BASE_URL = 'https://api.currencybeacon.com/v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface CurrencyBeaconProviderOptions {
  apiKey: string
  timeoutMs?: number
}

function parseObservation(value: unknown): RateObservation | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return { kind: 'timestamp', value }
}

export function createCurrencyBeaconProvider({
  apiKey,
  timeoutMs = 3_000,
}: CurrencyBeaconProviderOptions): GetExchangeRate {
  return async (base, quote, date, signal): Promise<ExchangeQuote> => {
    const endpoint = date ? 'historical' : 'latest'
    const url = new URL(`${API_BASE_URL}/${endpoint}`)
    const currencies = [...new Set([base, quote])]
    const requestedSymbols = currencies.filter((currency) => currency !== 'USD')

    url.searchParams.set('base', 'USD')
    if (date) {
      url.searchParams.set('date', date)
    }
    if (requestedSymbols.length > 0) {
      url.searchParams.set('symbols', requestedSymbols.join(','))
    }

    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw createProviderUnavailableError(
        PROVIDER,
        'CurrencyBeacon request failed',
        { cause: error },
      )
    }

    if (response.status === 401 || response.status === 403) {
      throw createProviderConfigurationError(
        PROVIDER,
        `CurrencyBeacon rejected credentials with status ${response.status}`,
      )
    }

    if ([400, 422].includes(response.status)) {
      throw createUnsupportedCurrencyError(currencies)
    }

    if (!response.ok) {
      throw createProviderUnavailableError(
        PROVIDER,
        `CurrencyBeacon returned status ${response.status}`,
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      throw createProviderUnavailableError(
        PROVIDER,
        'CurrencyBeacon returned invalid JSON',
        { cause: error },
      )
    }

    if (!isRecord(payload) || !isRecord(payload.response)) {
      throw createProviderUnavailableError(
        PROVIDER,
        'CurrencyBeacon response has an invalid structure',
      )
    }

    const rates = payload.response.rates
    if (!isRecord(rates)) {
      throw createProviderUnavailableError(
        PROVIDER,
        'CurrencyBeacon response does not contain rates',
      )
    }

    const getUsdRate = (currency: string): number => {
      if (currency === 'USD') {
        return 1
      }

      const rate = rates[currency]
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw createUnsupportedCurrencyError([currency])
      }

      return rate
    }

    const basePerUsd = getUsdRate(base)
    const quotePerUsd = getUsdRate(quote)
    const observedAt = parseObservation(payload.response.date)

    return {
      base,
      quote,
      rate: base === quote ? 1 : quotePerUsd / basePerUsd,
      provider: PROVIDER,
      ...(observedAt ? { observedAt } : {}),
    }
  }
}
