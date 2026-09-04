import { describe, expect, it, vi } from 'vitest'

import type { GetExchangeRate } from '../../../src/application/ports/exchange-rate-provider.js'
import { createConvertCurrency } from '../../../src/application/use-cases/convert-currency.js'
import { createProviderUnavailableError } from '../../../src/domain/errors.js'

describe('createConvertCurrency', () => {
  it('requests the pair and returns the converted amount with quote metadata', async () => {
    const getExchangeRate = vi.fn<GetExchangeRate>().mockResolvedValue({
      base: 'EUR',
      quote: 'GBP',
      rate: 0.8567,
      provider: 'currency-beacon',
      observedAt: { kind: 'timestamp', value: '2026-09-04T12:30:00Z' },
    })
    const convertCurrency = createConvertCurrency(getExchangeRate)

    const result = await convertCurrency({ amount: 125.5, base: 'EUR', quote: 'GBP' })

    expect(getExchangeRate).toHaveBeenCalledOnce()
    expect(getExchangeRate).toHaveBeenCalledWith('EUR', 'GBP')
    expect(result).toEqual({
      amount: 125.5,
      base: 'EUR',
      quote: 'GBP',
      rate: 0.8567,
      convertedAmount: 107.51585,
      provider: 'currency-beacon',
      observedAt: { kind: 'timestamp', value: '2026-09-04T12:30:00Z' },
    })
    expect(result.convertedAmount).toBeCloseTo(107.51585)
  })

  it('does not round the calculation in the use case', async () => {
    const getExchangeRate = vi.fn<GetExchangeRate>().mockResolvedValue({
      base: 'EUR',
      quote: 'USD',
      rate: 1 / 3,
      provider: 'frankfurter',
    })

    const result = await createConvertCurrency(getExchangeRate)({
      amount: 10,
      base: 'EUR',
      quote: 'USD',
    })

    expect(result.convertedAmount).toBeCloseTo(10 / 3)
  })

  it('propagates the provider error unchanged', async () => {
    const providerError = createProviderUnavailableError('frankfurter', 'offline')
    const getExchangeRate = vi.fn<GetExchangeRate>().mockRejectedValue(providerError)

    const conversion = createConvertCurrency(getExchangeRate)({
      amount: 1,
      base: 'EUR',
      quote: 'USD',
    })

    await expect(conversion).rejects.toBe(providerError)
  })
})
