import { describe, expect, it, vi } from 'vitest'

import type { GetExchangeRate } from '../../../../src/application/ports/exchange-rate-provider.js'
import {
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
  isAllProvidersFailedError,
} from '../../../../src/domain/errors.js'
import {
  createExchangeRatePairProvider,
  createFallbackProvider,
} from '../../../../src/infrastructure/exchange-rates/fallback-provider.js'
import { createLoggerSpy } from '../../../support/logger-spy.js'

const current = {
  base: 'EUR', quote: 'USD', rate: 1.1, provider: 'currency-beacon' as const,
}
const previous = { ...current, rate: 1.08 }

describe('exchange rate pair providers', () => {
  it('requests current and historical rates from one provider', async () => {
    const provider = vi.fn<GetExchangeRate>()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(previous)

    await expect(createExchangeRatePairProvider(provider)(
      'EUR', 'USD', '2026-09-03',
    )).resolves.toEqual({ current, previous })
    expect(provider).toHaveBeenNthCalledWith(
      1, 'EUR', 'USD', undefined, expect.any(AbortSignal),
    )
    expect(provider).toHaveBeenNthCalledWith(
      2, 'EUR', 'USD', '2026-09-03', expect.any(AbortSignal),
    )
  })

  it('falls back with both requests when the primary provider fails', async () => {
    const primaryError = createProviderUnavailableError('currency-beacon', 'timeout')
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue(primaryError)
    const fallbackCurrent = { ...current, provider: 'frankfurter' as const }
    const fallbackPrevious = { ...previous, provider: 'frankfurter' as const }
    const fallback = vi.fn<GetExchangeRate>()
      .mockResolvedValueOnce(fallbackCurrent)
      .mockResolvedValueOnce(fallbackPrevious)
    const logger = createLoggerSpy()
    const getPair = createFallbackProvider({ primary, fallback, logger })

    await expect(getPair('EUR', 'USD', '2026-09-03')).resolves.toEqual({
      current: fallbackCurrent,
      previous: fallbackPrevious,
    })
    expect(fallback).toHaveBeenNthCalledWith(
      1, 'EUR', 'USD', undefined, expect.any(AbortSignal),
    )
    expect(fallback).toHaveBeenNthCalledWith(
      2, 'EUR', 'USD', '2026-09-03', expect.any(AbortSignal),
    )
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('keeps the existing unsupported-currency behavior', async () => {
    const unsupported = createUnsupportedCurrencyError(['ZZZ'])
    const primary = vi.fn<GetExchangeRate>().mockRejectedValue(unsupported)
    const fallback = vi.fn<GetExchangeRate>()
    const getPair = createFallbackProvider({
      primary,
      fallback,
      logger: createLoggerSpy(),
    })

    await expect(getPair('ZZZ', 'USD', '2026-09-03')).rejects.toBe(unsupported)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('aborts and settles the remaining primary request before starting fallback', async () => {
    const primaryError = createProviderUnavailableError('currency-beacon', 'offline')
    let pendingPrimarySettled = false
    let fallbackStartedAfterPrimarySettled = false
    const primary = vi.fn<GetExchangeRate>((_base, _quote, date, signal) => {
      if (date === undefined) {
        return Promise.reject(primaryError)
      }

      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          pendingPrimarySettled = true
          reject(signal.reason)
        }, { once: true })
      })
    })
    const fallback = vi.fn<GetExchangeRate>((base, quote, date) => {
      fallbackStartedAfterPrimarySettled = pendingPrimarySettled
      return Promise.resolve({
        base,
        quote,
        rate: date ? 1.08 : 1.1,
        provider: 'frankfurter',
      })
    })
    const getPair = createFallbackProvider({
      primary,
      fallback,
      logger: createLoggerSpy(),
    })

    await expect(getPair('EUR', 'USD', '2026-09-03')).resolves.toMatchObject({
      current: { rate: 1.1 },
      previous: { rate: 1.08 },
    })
    expect(pendingPrimarySettled).toBe(true)
    expect(fallbackStartedAfterPrimarySettled).toBe(true)
  })

  it('prioritizes unsupported over unavailable regardless of rejection order', async () => {
    const unavailable = createProviderUnavailableError('currency-beacon', 'offline')
    const unsupported = createUnsupportedCurrencyError(['ZZZ'])
    const primary = vi.fn<GetExchangeRate>((_base, _quote, date) => (
      date === undefined ? Promise.reject(unavailable) : Promise.reject(unsupported)
    ))
    const fallback = vi.fn<GetExchangeRate>()
    const getPair = createFallbackProvider({
      primary,
      fallback,
      logger: createLoggerSpy(),
    })

    await expect(getPair('ZZZ', 'USD', '2026-09-03')).rejects.toBe(unsupported)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('preserves both errors when the fallback also fails', async () => {
    const primaryError = new Error('primary offline')
    const fallbackError = new Error('fallback offline')
    const getPair = createFallbackProvider({
      primary: vi.fn<GetExchangeRate>().mockRejectedValue(primaryError),
      fallback: vi.fn<GetExchangeRate>().mockRejectedValue(fallbackError),
      logger: createLoggerSpy(),
    })

    await expect(getPair('EUR', 'USD', '2026-09-03')).rejects.toSatisfy(
      (error: unknown) => isAllProvidersFailedError(error)
        && error.primaryError === primaryError
        && error.fallbackError === fallbackError,
    )
  })
})
