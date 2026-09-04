import { describe, expect, it, vi } from 'vitest'

import type { GetExchangeRate } from '../../../src/application/ports/exchange-rate-provider.js'
import { createGetPeriodChange } from '../../../src/application/use-cases/get-period-change.js'

describe('createGetPeriodChange', () => {
  it('gets one historical rate from the selected provider', async () => {
    const currencyBeacon = vi.fn<GetExchangeRate>().mockResolvedValue({
      base: 'BTC',
      quote: 'USD',
      rate: 80_000,
      provider: 'currency-beacon',
      observedAt: { kind: 'date', value: '2026-08-28' },
    })
    const frankfurter = vi.fn<GetExchangeRate>()
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

    expect(result).toEqual({
      base: 'BTC',
      quote: 'USD',
      currentRate: 84_000,
      provider: 'currency-beacon',
      days: 7,
      referenceDate: new Date('2026-09-04T23:30:00.000Z'),
      historicalRate: 80_000,
      changePercent: expect.any(Number),
      historicalObservedAt: { kind: 'date', value: '2026-08-28' },
    })
    expect(result.changePercent).toBeCloseTo(5)
    expect(currencyBeacon).toHaveBeenCalledOnce()
    expect(currencyBeacon).toHaveBeenCalledWith('BTC', 'USD', '2026-08-28')
    expect(frankfurter).not.toHaveBeenCalled()
  })

  it('uses the current time when the callback message date is absent', async () => {
    const frankfurter = vi.fn<GetExchangeRate>().mockResolvedValue({
      base: 'EUR',
      quote: 'USD',
      rate: 1,
      provider: 'frankfurter',
    })
    const now = () => new Date('2026-09-04T10:00:00.000Z')
    const getPeriodChange = createGetPeriodChange({ frankfurter }, now)

    const result = await getPeriodChange({
      base: 'EUR',
      quote: 'USD',
      currentRate: 0.95,
      provider: 'frankfurter',
      days: 30,
    })

    expect(frankfurter).toHaveBeenCalledWith('EUR', 'USD', '2026-08-05')
    expect(result.referenceDate).toEqual(now())
    expect(result.changePercent).toBeCloseTo(-5)
  })
})
