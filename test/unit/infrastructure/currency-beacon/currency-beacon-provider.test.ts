import { afterEach, describe, expect, it, vi } from 'vitest'

import { isUnsupportedCurrencyError } from '../../../../src/domain/errors.js'
import { createCurrencyBeaconProvider } from '../../../../src/infrastructure/currency-beacon/currency-beacon-provider.js'
import { createLoggerSpy } from '../../../support/logger-spy.js'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createCurrencyBeaconProvider', () => {
  it('calculates a crypto cross-rate through USD and authenticates the request', async () => {
    const fetchMock = stubFetch(jsonResponse({
      response: {
        date: '2026-09-04T17:37:22Z',
        base: 'USD',
        rates: { BTC: 0.0000125, ETH: 0.0004 },
      },
    }))
    const provider = createCurrencyBeaconProvider({
      apiKey: 'test-key',
      logger: createLoggerSpy(),
    })

    await expect(provider('BTC', 'ETH')).resolves.toEqual({
      base: 'BTC',
      quote: 'ETH',
      rate: 32,
      provider: 'currency-beacon',
      observedAt: { kind: 'timestamp', value: '2026-09-04T17:37:22Z' },
    })

    const [request, init] = fetchMock.mock.calls[0]!
    const url = new URL(String(request))
    expect(url.searchParams.get('base')).toBe('USD')
    expect(url.searchParams.get('symbols')).toBe('BTC,ETH')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
  })

  it('passes long alphanumeric tickers to CurrencyBeacon without truncating them', async () => {
    const fetchMock = stubFetch(jsonResponse({
      response: {
        date: '2026-09-04T17:37:22Z',
        rates: { '1INCH': 10, USDT: 1 },
      },
    }))
    const provider = createCurrencyBeaconProvider({
      apiKey: 'test-key',
      logger: createLoggerSpy(),
    })

    await expect(provider('1INCH', 'USDT')).resolves.toMatchObject({ rate: 0.1 })

    const [request] = fetchMock.mock.calls[0]!
    expect(new URL(String(request)).searchParams.get('symbols')).toBe('1INCH,USDT')
  })

  it('uses the implicit USD rate for a crypto-to-fiat pair', async () => {
    stubFetch(jsonResponse({
      response: {
        date: '2026-09-04T17:37:22Z',
        rates: { BTC: 0.0000125 },
      },
    }))
    const provider = createCurrencyBeaconProvider({
      apiKey: 'test-key',
      logger: createLoggerSpy(),
    })

    await expect(provider('BTC', 'USD')).resolves.toMatchObject({
      base: 'BTC',
      quote: 'USD',
      rate: 80_000,
    })
  })

  it('reports a ticker with a null rate as unsupported', async () => {
    stubFetch(jsonResponse({
      response: {
        date: '2026-09-04T17:37:22Z',
        rates: { TON: null },
      },
    }))
    const provider = createCurrencyBeaconProvider({
      apiKey: 'test-key',
      logger: createLoggerSpy(),
    })

    await expect(provider('TON', 'USD')).rejects.toSatisfy((error: unknown) => {
      return isUnsupportedCurrencyError(error) && error.currencies[0] === 'TON'
    })
  })

  it.each([
    ['invalid JSON', new Response('not-json'), 'CurrencyBeacon returned invalid JSON'],
    ['a missing response envelope', jsonResponse({}), 'CurrencyBeacon response has an invalid structure'],
    ['missing rates', jsonResponse({ response: {} }), 'CurrencyBeacon response does not contain rates'],
  ])('rejects a malformed provider response with %s', async (_case, response, message) => {
    stubFetch(response)
    const provider = createCurrencyBeaconProvider({
      apiKey: 'test-key',
      logger: createLoggerSpy(),
    })

    await expect(provider('BTC', 'USD')).rejects.toMatchObject({
      name: 'ProviderUnavailableError',
      message,
    })
  })
})
