import type { GetExchangeRate } from '../../application/ports/exchange-rate-provider.js'
import type { Logger } from '../../application/ports/logger.js'
import type { ExchangeQuote } from '../../domain/currency.js'
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

export function createFallbackProvider({
  primary,
  fallback,
  logger,
}: FallbackProviderOptions): GetExchangeRate {
  return async (base, quote): Promise<ExchangeQuote> => {
    try {
      return await primary(base, quote)
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
        return await fallback(base, quote)
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
