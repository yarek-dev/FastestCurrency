import {
  deepStrictEqual,
  strictEqual,
} from 'node:assert/strict'

import type { GetExchangeRate } from '../../../functions/telegram-webhook/application/ports/exchange-rate-provider.ts'
import { createGetPeriodChange } from '../../../functions/telegram-webhook/application/use-cases/get-period-change.ts'

Deno.test('gets one historical rate from the selected provider', async () => {
  let currencyBeaconCall: Parameters<GetExchangeRate> | undefined
  let frankfurterCalled = false
  const currencyBeacon: GetExchangeRate = (...input) => {
    currencyBeaconCall = input
    return Promise.resolve({
      base: 'BTC',
      quote: 'USD',
      rate: 80_000,
      provider: 'currency-beacon',
      observedAt: { kind: 'date', value: '2026-08-28' },
    })
  }
  const frankfurter: GetExchangeRate = () => {
    frankfurterCalled = true
    return Promise.reject(new Error('should not be called'))
  }
  const getPeriodChange = createGetPeriodChange({
    'currency-beacon': currencyBeacon,
    frankfurter,
  })

  const result = await getPeriodChange({
    base: 'BTC',
    quote: 'USD',
    currentRate: 84_000,
    provider: 'currency-beacon',
    days: 7,
    referenceDate: new Date('2026-09-04T23:30:00.000Z'),
  })

  deepStrictEqual(result, {
    base: 'BTC',
    quote: 'USD',
    currentRate: 84_000,
    provider: 'currency-beacon',
    days: 7,
    referenceDate: new Date('2026-09-04T23:30:00.000Z'),
    historicalRate: 80_000,
    changePercent: 5.000000000000004,
    historicalObservedAt: { kind: 'date', value: '2026-08-28' },
  })
  deepStrictEqual(currencyBeaconCall, ['BTC', 'USD', '2026-08-28'])
  strictEqual(frankfurterCalled, false)
})

Deno.test('uses the current time when the callback message date is absent', async () => {
  let frankfurterCall: Parameters<GetExchangeRate> | undefined
  const frankfurter: GetExchangeRate = (...input) => {
    frankfurterCall = input
    return Promise.resolve({
      base: 'EUR',
      quote: 'USD',
      rate: 1,
      provider: 'frankfurter',
    })
  }
  const now = () => new Date('2026-09-04T10:00:00.000Z')
  const getPeriodChange = createGetPeriodChange({ frankfurter }, now)

  const result = await getPeriodChange({
    base: 'EUR',
    quote: 'USD',
    currentRate: 0.95,
    provider: 'frankfurter',
    days: 30,
  })

  deepStrictEqual(frankfurterCall, ['EUR', 'USD', '2026-08-05'])
  deepStrictEqual(result.referenceDate, now())
  strictEqual(result.changePercent, -5.000000000000004)
})
