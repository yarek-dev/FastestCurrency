import {
  deepStrictEqual,
  strictEqual,
} from 'node:assert/strict'

import { createFrankfurterProvider } from '../../../../functions/telegram-webhook/infrastructure/frankfurter/frankfurter-provider.ts'

Deno.test('uses the dated v1 endpoint for a historical rate', async () => {
  const originalFetch = globalThis.fetch
  let request: RequestInfo | URL | undefined

  globalThis.fetch = (input): Promise<Response> => {
    request = input
    return Promise.resolve(new Response(JSON.stringify({
      date: '2026-09-03',
      base: 'EUR',
      rates: { USD: 1.1 },
    }), { status: 200 }))
  }

  try {
    const result = await createFrankfurterProvider()('EUR', 'USD', '2026-09-03')

    deepStrictEqual(result, {
      base: 'EUR',
      quote: 'USD',
      rate: 1.1,
      provider: 'frankfurter',
      observedAt: { kind: 'date', value: '2026-09-03' },
    })

    const url = new URL(String(request))
    strictEqual(url.pathname, '/v1/2026-09-03')
    strictEqual(url.searchParams.get('base'), 'EUR')
    strictEqual(url.searchParams.get('symbols'), 'USD')
  } finally {
    globalThis.fetch = originalFetch
  }
})
