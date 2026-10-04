import {
  deepStrictEqual,
  ok,
  rejects,
  strictEqual,
} from 'node:assert/strict'

import type { GetExchangeRate } from '../../../../functions/telegram-webhook/application/ports/exchange-rate-provider.ts'
import {
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
  isAllProvidersFailedError,
} from '../../../../functions/telegram-webhook/domain/errors.ts'
import {
  createExchangeRatePairProvider,
  createFallbackProvider,
} from '../../../../functions/telegram-webhook/infrastructure/exchange-rates/fallback-provider.ts'

const current = {
  base: 'EUR', quote: 'USD', rate: 1.1, provider: 'currency-beacon' as const,
}
const previous = { ...current, rate: 1.08 }

Deno.test('requests current and historical rates from one provider', async () => {
  const calls: { date: string | undefined; signal: AbortSignal | undefined }[] = []
  const provider: GetExchangeRate = (_base, _quote, date, signal) => {
    calls.push({ date, signal })
    return Promise.resolve(date ? previous : current)
  }

  const result = await createExchangeRatePairProvider(provider)(
    'EUR', 'USD', '2026-09-03',
  )

  deepStrictEqual(result, { current, previous })
  strictEqual(calls[0]?.date, undefined)
  strictEqual(calls[1]?.date, '2026-09-03')
  ok(calls[0]?.signal instanceof AbortSignal)
  ok(calls[1]?.signal instanceof AbortSignal)
})

Deno.test('falls back with both requests when the primary provider fails', async () => {
  const primaryError = createProviderUnavailableError('currency-beacon', 'timeout')
  const primary: GetExchangeRate = () => Promise.reject(primaryError)
  const fallbackCalls: (string | undefined)[] = []
  const fallbackCurrent = { ...current, provider: 'frankfurter' as const }
  const fallbackPrevious = { ...previous, provider: 'frankfurter' as const }
  const fallback: GetExchangeRate = (_base, _quote, date) => {
    fallbackCalls.push(date)
    return Promise.resolve(date ? fallbackPrevious : fallbackCurrent)
  }
  const getPair = createFallbackProvider({ primary, fallback })

  const result = await getPair('EUR', 'USD', '2026-09-03')

  deepStrictEqual(result, {
    current: fallbackCurrent,
    previous: fallbackPrevious,
  })
  deepStrictEqual(fallbackCalls, [undefined, '2026-09-03'])
})

Deno.test('keeps the existing unsupported-currency behavior', async () => {
  const unsupported = createUnsupportedCurrencyError(['ZZZ'])
  const primary: GetExchangeRate = () => Promise.reject(unsupported)
  let fallbackCalled = false
  const fallback: GetExchangeRate = () => {
    fallbackCalled = true
    return Promise.resolve(current)
  }
  const getPair = createFallbackProvider({ primary, fallback })

  await rejects(getPair('ZZZ', 'USD', '2026-09-03'), (error: unknown) => {
    return error === unsupported
  })
  strictEqual(fallbackCalled, false)
})

Deno.test('aborts and settles the remaining primary request before starting fallback', async () => {
  const primaryError = createProviderUnavailableError('currency-beacon', 'offline')
  let pendingPrimarySettled = false
  let fallbackStartedAfterPrimarySettled = false
  const primary: GetExchangeRate = (_base, _quote, date, signal) => {
    if (date === undefined) {
      return Promise.reject(primaryError)
    }

    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        pendingPrimarySettled = true
        reject(signal.reason)
      }, { once: true })
    })
  }
  const fallback: GetExchangeRate = (base, quote, date) => {
    fallbackStartedAfterPrimarySettled = pendingPrimarySettled
    return Promise.resolve({
      base,
      quote,
      rate: date ? 1.08 : 1.1,
      provider: 'frankfurter',
    })
  }
  const getPair = createFallbackProvider({ primary, fallback })

  const result = await getPair('EUR', 'USD', '2026-09-03')

  strictEqual(result.current.rate, 1.1)
  strictEqual(result.previous.rate, 1.08)
  strictEqual(pendingPrimarySettled, true)
  strictEqual(fallbackStartedAfterPrimarySettled, true)
})

Deno.test('prioritizes unsupported over unavailable regardless of rejection order', async () => {
  const unavailable = createProviderUnavailableError('currency-beacon', 'offline')
  const unsupported = createUnsupportedCurrencyError(['ZZZ'])
  const primary: GetExchangeRate = (_base, _quote, date) => (
    date === undefined ? Promise.reject(unavailable) : Promise.reject(unsupported)
  )
  let fallbackCalled = false
  const fallback: GetExchangeRate = () => {
    fallbackCalled = true
    return Promise.resolve(current)
  }
  const getPair = createFallbackProvider({ primary, fallback })

  await rejects(getPair('ZZZ', 'USD', '2026-09-03'), (error: unknown) => {
    return error === unsupported
  })
  strictEqual(fallbackCalled, false)
})

Deno.test('preserves both errors when the fallback also fails', async () => {
  const primaryError = new Error('primary offline')
  const fallbackError = new Error('fallback offline')
  const primary: GetExchangeRate = () => Promise.reject(primaryError)
  const fallback: GetExchangeRate = () => Promise.reject(fallbackError)
  const getPair = createFallbackProvider({ primary, fallback })

  await rejects(getPair('EUR', 'USD', '2026-09-03'), (error: unknown) => {
    return isAllProvidersFailedError(error)
      && error.primaryError === primaryError
      && error.fallbackError === fallbackError
  })
})
