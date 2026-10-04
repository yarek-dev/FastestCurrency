import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import {
  toIncomingTelegramMessage,
  toOutgoingTelegramMessage,
} from '../../../functions/telegram-webhook/presentation/telegram/telegram-message-mapper.ts'

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
      text: 'EUR USD',
    },
  })

  deepStrictEqual(message, {
    userTelegramId: '123',
    firstName: 'Yaroslav',
    lastName: 'Developer',
    author: 'yarek_dev',
    body: 'EUR USD',
    createdAt: new Date(1_778_000_000_000).toISOString(),
  })
})

Deno.test('maps a callback response to a bot message', () => {
  const message = toOutgoingTelegramMessage({
    callback_query: {
      from: { id: 123, first_name: 'Yaroslav' },
      message: { chat: { id: 123, type: 'private' } },
    },
  }, {
    method: 'sendMessage',
    chat_id: 123,
    text: 'Period result',
  })

  strictEqual(message?.userTelegramId, '123')
  strictEqual(message?.author, 'bot')
  strictEqual(message?.body, 'Period result')
  strictEqual(Number.isNaN(Date.parse(message?.createdAt ?? '')), false)
})
