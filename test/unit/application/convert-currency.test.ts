import { describe, expect, it, vi } from 'vitest'

import type { GetExchangeRatePair } from '../../../src/application/ports/exchange-rate-provider.js'
import { createConvertCurrency } from '../../../src/application/use-cases/convert-currency.js'
import { createProviderUnavailableError } from '../../../src/domain/errors.js'

describe('createConvertCurrency', () => {
  it('converts and compares with the previous UTC day', async () => {
    const getExchangeRatePair = vi.fn<GetExchangeRatePair>().mockResolvedValue({
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
    })
    const convertCurrency = createConvertCurrency(
      getExchangeRatePair,
      () => new Date('2026-09-04T00:05:00Z'),
    )

    const result = await convertCurrency({ amount: 125.5, base: 'EUR', quote: 'GBP' })

    expect(getExchangeRatePair).toHaveBeenCalledWith('EUR', 'GBP', '2026-09-03')
    expect(result).toMatchObject({
      amount: 125.5,
      rate: 0.8567,
      previousRate: 0.84,
      convertedAmount: 107.51585,
      provider: 'currency-beacon',
    })
    expect(result.changePercent).toBeCloseTo(1.988095)
  })

  it('propagates the provider error unchanged', async () => {
    const providerError = createProviderUnavailableError('frankfurter', 'offline')
    const getExchangeRatePair = vi.fn<GetExchangeRatePair>().mockRejectedValue(providerError)

    await expect(createConvertCurrency(getExchangeRatePair)({
      amount: 1,
      base: 'EUR',
      quote: 'USD',
    })).rejects.toBe(providerError)
  })
})
