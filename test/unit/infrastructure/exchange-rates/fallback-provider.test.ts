import { describe, expect, it, vi } from 'vitest'

import type { GetExchangeRate } from '../../../../src/application/ports/exchange-rate-provider.js'
import {
  createProviderConfigurationError,
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
  isAllProvidersFailedError,
} from '../../../../src/domain/errors.js'
import { createFallbackProvider } from '../../../../src/infrastructure/exchange-rates/fallback-provider.js'
import { createLoggerSpy } from '../../../support/logger-spy.js'

const quote = {
  base: 'EUR',
  quote: 'USD',
  rate: 1.1,
  provider: 'currency-beacon' as const,
}

describe('createFallbackProvider', () => {
  it('returns the primary result without calling fallback or logger', async () => {
    const primary = vi.fn<GetExchangeRate>().mockResolvedValue(quote)
    const fallback = vi.fn<GetExchangeRate>()
    const logger = createLoggerSpy()
    const getExchangeRate = createFallbackProvider({ primary, fallback, logger })

    await expect(getExchangeRate('EUR', 'USD')).resolves.toBe(quote)
    expect(primary).toHaveBeenCalledWith('EUR', 'USD')
    expect(fallback).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('does not use fallback for an unsupported currency from primary', async () => {
    const unsupported = createUnsupportedCurrencyError(['ZZZ'])
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue(unsupported)
    const fallback = vi.fn<GetExchangeRate>()
    const logger = createLoggerSpy()
    const getExchangeRate = createFallbackProvider({ primary, fallback, logger })

    await expect(getExchangeRate('ZZZ', 'USD')).rejects.toBe(unsupported)
    expect(fallback).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs a warning and returns fallback when primary is unavailable', async () => {
    const primaryError = createProviderUnavailableError('currency-beacon', 'timeout')
    const fallbackQuote = { ...quote, provider: 'frankfurter' as const, rate: 1.09 }
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue(primaryError)
    const fallback = vi.fn<GetExchangeRate>().mockResolvedValue(fallbackQuote)
    const logger = createLoggerSpy()
    const getExchangeRate = createFallbackProvider({ primary, fallback, logger })

    await expect(getExchangeRate('EUR', 'USD')).resolves.toBe(fallbackQuote)
    expect(fallback).toHaveBeenCalledOnce()
    expect(fallback).toHaveBeenCalledWith('EUR', 'USD')
    expect(logger.warn).toHaveBeenCalledWith({
      provider: 'currency-beacon',
      base: 'EUR',
      quote: 'USD',
      errorName: 'ProviderUnavailableError',
      errorMessage: 'timeout',
    }, 'Primary currency provider failed, using fallback')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs an error before fallback for a primary configuration failure', async () => {
    const primaryError = createProviderConfigurationError('currency-beacon', 'invalid API key')
    const fallbackQuote = { ...quote, provider: 'frankfurter' as const }
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue(primaryError)
    const fallback = vi.fn<GetExchangeRate>().mockResolvedValue(fallbackQuote)
    const logger = createLoggerSpy()
    const getExchangeRate = createFallbackProvider({ primary, fallback, logger })

    await expect(getExchangeRate('EUR', 'USD')).resolves.toBe(fallbackQuote)
    expect(logger.error).toHaveBeenCalledWith({
      provider: 'currency-beacon',
      base: 'EUR',
      quote: 'USD',
      errorName: 'ProviderConfigurationError',
      errorMessage: 'invalid API key',
    }, 'Primary currency provider configuration failed, using fallback')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('normalizes a non-Error primary rejection before logging and aggregating', async () => {
    const fallbackError = new Error('fallback offline')
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue('connection lost')
    const fallback = vi.fn<GetExchangeRate>().mockRejectedValue(fallbackError)
    const logger = createLoggerSpy()
    const getExchangeRate = createFallbackProvider({ primary, fallback, logger })

    const result = getExchangeRate('EUR', 'USD')

    await expect(result).rejects.toSatisfy((error: unknown) => {
      if (!isAllProvidersFailedError(error)) return false

      return error.primaryError.message === 'Unknown provider error'
        && error.fallbackError === fallbackError
        && error.cause === fallbackError
    })
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      errorName: 'Error',
      errorMessage: 'Unknown provider error',
    }), 'Primary currency provider failed, using fallback')
  })

  it('normalizes a non-Error fallback rejection in the aggregate error', async () => {
    const primaryError = new Error('primary offline')
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue(primaryError)
    const fallback = vi.fn<GetExchangeRate>().mockRejectedValue(null)
    const getExchangeRate = createFallbackProvider({
      primary,
      fallback,
      logger: createLoggerSpy(),
    })

    await expect(getExchangeRate('EUR', 'USD')).rejects.toMatchObject({
      name: 'AllProvidersFailedError',
      primaryError,
      fallbackError: expect.objectContaining({
        name: 'Error',
        message: 'Unknown fallback provider error',
      }),
    })
  })
})
