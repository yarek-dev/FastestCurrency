import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import { toIncomingTelegramMessage } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-message-mapper.ts'
import { createTelegramUpdateAdapter } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-update-adapter.ts'

Deno.test('maps a private Telegram message to a database record', () => {
  const message = toIncomingTelegramMessage({
    message: {
      date: 1_778_000_000,
      from: {
        id: 123,
        first_name: 'Yaroslav',
        last_name: 'Developer',
        username: 'yarek_dev',
      },
      chat: { id: 123, type: 'private' },
      text: 'Как оплатить через ЕРИП?',
    },
  })

  deepStrictEqual(message, {
    userTelegramId: '123',
    firstName: 'Yaroslav',
    lastName: 'Developer',
    author: 'yarek_dev',
    body: 'Как оплатить через ЕРИП?',
    createdAt: new Date(1_778_000_000_000).toISOString(),
  })
})

Deno.test('passes only private messages to the application and addresses the reply to the chat', async () => {
  const handle = createTelegramUpdateAdapter(async ({ incoming, replyTo }) => {
    strictEqual(incoming?.userTelegramId, '123')
    deepStrictEqual(replyTo, { text: '/start' })
    return 'Здравствуйте!'
  })
  const message = { from: { id: 123 }, chat: { id: 456, type: 'private' }, text: '/start' }
  deepStrictEqual(await handle({ message }), { method: 'sendMessage', chat_id: 456, text: 'Здравствуйте!' })
  strictEqual(await handle({ message: { ...message, chat: { id: 999, type: 'group' } } }), undefined)
})
