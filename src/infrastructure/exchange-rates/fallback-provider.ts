import type {
  GetExchangeRate,
  GetExchangeRatePair,
} from '../../application/ports/exchange-rate-provider.js'
import type { Logger } from '../../application/ports/logger.js'
import {
  createAllProvidersFailedError,
  isProviderConfigurationError,
  isUnsupportedCurrencyError,
} from '../../domain/errors.js'
import { toError } from '../../shared/errors.js'

interface FallbackProviderOptions {
  primary: GetExchangeRate
  fallback: GetExchangeRate
  logger: Logger
}

export function createExchangeRatePairProvider(
  provider: GetExchangeRate,
): GetExchangeRatePair {
  return async (base, quote, previousDate) => {
    const controller = new AbortController()
    const abortOnFailure = async <T>(operation: Promise<T>): Promise<T> => {
      try {
        return await operation
      } catch (error) {
        controller.abort()
        throw error
      }
    }
    const results = await Promise.allSettled([
      abortOnFailure(provider(base, quote, undefined, controller.signal)),
      abortOnFailure(provider(base, quote, previousDate, controller.signal)),
    ])

    const errors = results.flatMap((result) => (
      result.status === 'rejected' ? [result.reason] : []
    ))
    if (errors.length > 0) {
      throw errors.find(isUnsupportedCurrencyError) ?? errors[0]
    }

    const [current, previous] = results
    if (current.status !== 'fulfilled' || previous.status !== 'fulfilled') {
      throw new Error('Exchange rate pair has an invalid state')
    }

    return { current: current.value, previous: previous.value }
  }
}

export function createFallbackProvider({
  primary,
  fallback,
  logger,
}: FallbackProviderOptions): GetExchangeRatePair {
  const getPrimaryPair = createExchangeRatePairProvider(primary)
  const getFallbackPair = createExchangeRatePairProvider(fallback)

  return async (base, quote, previousDate) => {
    try {
      return await getPrimaryPair(base, quote, previousDate)
    } catch (error) {
      if (isUnsupportedCurrencyError(error)) {
        throw error
      }

      const primaryError = toError(error, 'Unknown provider error')
      const logContext = {
        provider: 'currency-beacon',
        base,
        quote,
        errorName: primaryError.name,
        errorMessage: primaryError.message,
      }

      if (isProviderConfigurationError(primaryError)) {
        logger.error(
          logContext,
          'Primary currency provider configuration failed, using fallback',
        )
      } else {
        logger.warn(
          logContext,
          'Primary currency provider failed, using fallback',
        )
      }

      try {
        return await getFallbackPair(base, quote, previousDate)
      } catch (fallbackError) {
        const normalizedFallbackError = toError(
          fallbackError,
          'Unknown fallback provider error',
        )

        throw createAllProvidersFailedError(primaryError, normalizedFallbackError)
      }
    }
  }
}
