import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFrankfurterProvider } from '../../../../src/infrastructure/frankfurter/frankfurter-provider.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createFrankfurterProvider', () => {
  it('uses the dated v1 endpoint for a historical rate', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      date: '2026-09-03',
      base: 'EUR',
      rates: { USD: 1.1 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createFrankfurterProvider()('EUR', 'USD', '2026-09-03')).resolves.toEqual({
      base: 'EUR',
      quote: 'USD',
      rate: 1.1,
      provider: 'frankfurter',
      observedAt: { kind: 'date', value: '2026-09-03' },
    })
    const [request] = fetchMock.mock.calls[0]!
    const url = new URL(String(request))
    expect(url.pathname).toBe('/v1/2026-09-03')
    expect(url.searchParams.get('base')).toBe('EUR')
    expect(url.searchParams.get('symbols')).toBe('USD')
  })
})
