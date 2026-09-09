import {
  rejects,
  strictEqual,
} from 'node:assert/strict'

import { createAnswerCallbackQuery } from '../../../../functions/telegram-webhook/infrastructure/telegram/telegram-bot-api.ts'

Deno.test('acknowledges a callback through Telegram Bot API', async () => {
  const originalFetch = globalThis.fetch
  let receivedUrl: string | URL | Request | undefined
  let receivedInit: RequestInit | undefined
  globalThis.fetch = (input, init) => {
    receivedUrl = input
    receivedInit = init
    return Promise.resolve(new Response(JSON.stringify({ ok: true })))
  }

  try {
    await createAnswerCallbackQuery('secret-token')('callback-1')

    strictEqual(receivedUrl, 'https://api.telegram.org/botsecret-token/answerCallbackQuery')
    strictEqual(receivedInit?.method, 'POST')
    strictEqual(
      receivedInit?.body,
      JSON.stringify({ callback_query_id: 'callback-1' }),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('rejects a Telegram API error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => Promise.resolve(
    new Response(JSON.stringify({ ok: false, description: 'query is too old' }), {
      status: 400,
    }),
  )

  try {
    await rejects(
      createAnswerCallbackQuery('secret-token')('callback-1'),
      /query is too old/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
