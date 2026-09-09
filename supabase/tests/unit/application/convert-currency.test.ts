import {
  deepStrictEqual,
  ok,
  strictEqual,
} from 'node:assert/strict'

import type { GetExchangeRatePair } from '../../../functions/telegram-webhook/application/ports/exchange-rate-provider.ts'
import { createConvertCurrency } from '../../../functions/telegram-webhook/application/use-cases/convert-currency.ts'

Deno.test('converts and compares with the previous UTC day', async () => {
  let receivedArguments: Parameters<GetExchangeRatePair> | undefined
  const getExchangeRatePair: GetExchangeRatePair = async (...args) => {
    receivedArguments = args
    return {
      current: {
        base: 'EUR',
        quote: 'GBP',
        rate: 0.8567,
        provider: 'currency-beacon',
        observedAt: { kind: 'timestamp', value: '2026-09-04T12:30:00Z' },
      },
      previous: {
        base: 'EUR',
        quote: 'GBP',
        rate: 0.84,
        provider: 'currency-beacon',
      },
    }
  }
  const convertCurrency = createConvertCurrency(
    getExchangeRatePair,
    () => new Date('2026-09-04T00:05:00Z'),
  )

  const result = await convertCurrency({ amount: 125.5, base: 'EUR', quote: 'GBP' })

  deepStrictEqual(receivedArguments, ['EUR', 'GBP', '2026-09-03'])
  strictEqual(result.amount, 125.5)
  strictEqual(result.rate, 0.8567)
  strictEqual(result.previousRate, 0.84)
  strictEqual(result.convertedAmount, 107.51585)
  strictEqual(result.provider, 'currency-beacon')
  ok(Math.abs(result.changePercent - 1.988095) < 0.000001)
})

Deno.test('propagates the provider error unchanged', async () => {
  const providerError = new Error('provider failed')
  const getExchangeRatePair: GetExchangeRatePair = () => Promise.reject(providerError)
  const convertCurrency = createConvertCurrency(getExchangeRatePair)

  try {
    await convertCurrency({ amount: 1, base: 'EUR', quote: 'USD' })
  } catch (error) {
    strictEqual(error, providerError)
    return
  }

  throw new Error('Expected convertCurrency to reject')
})
