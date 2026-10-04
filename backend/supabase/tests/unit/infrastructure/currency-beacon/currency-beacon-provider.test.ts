import {
  deepStrictEqual,
  rejects,
  strictEqual,
} from 'node:assert/strict'

import { isUnsupportedCurrencyError } from '../../../../functions/telegram-webhook/domain/errors.ts'
import { createCurrencyBeaconProvider } from '../../../../functions/telegram-webhook/infrastructure/currency-beacon/currency-beacon-provider.ts'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(response: Response) {
  const originalFetch = globalThis.fetch
  const calls: [RequestInfo | URL, RequestInit | undefined][] = []

  globalThis.fetch = (input, init): Promise<Response> => {
    calls.push([input, init])
    return Promise.resolve(response)
  }

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

Deno.test('calculates a crypto cross-rate through USD and authenticates the request', async () => {
  const fetchStub = stubFetch(jsonResponse({
    response: {
      date: '2026-09-04T17:37:22Z',
      base: 'USD',
      rates: { BTC: 0.0000125, ETH: 0.0004 },
    },
  }))

  try {
    const provider = createCurrencyBeaconProvider({ apiKey: 'test-key' })
    const result = await provider('BTC', 'ETH')

    deepStrictEqual(result, {
      base: 'BTC',
      quote: 'ETH',
      rate: 32,
      provider: 'currency-beacon',
      observedAt: { kind: 'timestamp', value: '2026-09-04T17:37:22Z' },
    })

    const [request, init] = fetchStub.calls[0]!
    const url = new URL(String(request))
    strictEqual(url.searchParams.get('base'), 'USD')
    strictEqual(url.searchParams.get('symbols'), 'BTC,ETH')
    strictEqual(new Headers(init?.headers).get('authorization'), 'Bearer test-key')
  } finally {
    fetchStub.restore()
  }
})

Deno.test('passes long alphanumeric tickers without truncating them', async () => {
  const fetchStub = stubFetch(jsonResponse({
    response: {
      date: '2026-09-04T17:37:22Z',
      rates: { '1INCH': 10, USDT: 1 },
    },
  }))

  try {
    const provider = createCurrencyBeaconProvider({ apiKey: 'test-key' })
    const result = await provider('1INCH', 'USDT')

    strictEqual(result.rate, 0.1)
    const [request] = fetchStub.calls[0]!
    strictEqual(new URL(String(request)).searchParams.get('symbols'), '1INCH,USDT')
  } finally {
    fetchStub.restore()
  }
})

Deno.test('uses the implicit USD rate for a crypto-to-fiat pair', async () => {
  const fetchStub = stubFetch(jsonResponse({
    response: {
      date: '2026-09-04T17:37:22Z',
      rates: { BTC: 0.0000125 },
    },
  }))

  try {
    const provider = createCurrencyBeaconProvider({ apiKey: 'test-key' })
    const result = await provider('BTC', 'USD')

    strictEqual(result.base, 'BTC')
    strictEqual(result.quote, 'USD')
    strictEqual(result.rate, 80_000)
  } finally {
    fetchStub.restore()
  }
})

Deno.test('requests a historical rate for the supplied date', async () => {
  const fetchStub = stubFetch(jsonResponse({
    response: {
      date: '2026-09-03',
      rates: { EUR: 0.9 },
    },
  }))

  try {
    const provider = createCurrencyBeaconProvider({ apiKey: 'test-key' })
    const result = await provider('EUR', 'USD', '2026-09-03')

    strictEqual(result.rate, 1 / 0.9)
    const [request] = fetchStub.calls[0]!
    const url = new URL(String(request))
    strictEqual(url.pathname, '/v1/historical')
    strictEqual(url.searchParams.get('date'), '2026-09-03')
    strictEqual(url.searchParams.get('base'), 'USD')
  } finally {
    fetchStub.restore()
  }
})

Deno.test('reports a ticker with a null rate as unsupported', async () => {
  const fetchStub = stubFetch(jsonResponse({
    response: {
      date: '2026-09-04T17:37:22Z',
      rates: { TON: null },
    },
  }))

  try {
    const provider = createCurrencyBeaconProvider({ apiKey: 'test-key' })
    await rejects(provider('TON', 'USD'), (error: unknown) => {
      return isUnsupportedCurrencyError(error) && error.currencies[0] === 'TON'
    })
  } finally {
    fetchStub.restore()
  }
})

const malformedResponseCases = [
  ['invalid JSON', new Response('not-json'), 'CurrencyBeacon returned invalid JSON'],
  ['a missing response envelope', jsonResponse({}), 'CurrencyBeacon response has an invalid structure'],
  ['missing rates', jsonResponse({ response: {} }), 'CurrencyBeacon response does not contain rates'],
] as const

for (const [testCase, response, message] of malformedResponseCases) {
  Deno.test(`rejects a malformed provider response with ${testCase}`, async () => {
    const fetchStub = stubFetch(response)

    try {
      const provider = createCurrencyBeaconProvider({ apiKey: 'test-key' })
      await rejects(provider('BTC', 'USD'), (error: unknown) => {
        return error instanceof Error
          && error.name === 'ProviderUnavailableError'
          && error.message === message
      })
    } finally {
      fetchStub.restore()
    }
  })
}
