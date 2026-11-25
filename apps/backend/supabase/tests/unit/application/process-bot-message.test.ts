import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import type { MessageRecord } from '@backend/supabase/functions/telegram-webhook/application/ports/message-repository.ts'
import { createProcessBotMessage } from '@backend/supabase/functions/telegram-webhook/application/use-cases/process-bot-message.ts'

const incoming: MessageRecord = {
  userTelegramId: '123',
  firstName: 'Test',
  lastName: null,
  author: 'test_client',
  body: 'Как оплатить через ЕРИП?',
  createdAt: '2026-09-17T10:00:00.000Z',
}
const message = { incoming, replyTo: { text: incoming.body } }
const replyText = 'Для оплаты выберите медцентр в дереве услуг ЕРИП.'

Deno.test('stores the incoming message, prepares its reply, and stores the outgoing message', async () => {
  const events: unknown[] = []
  const process = createProcessBotMessage({
    messageRepository: { async save(record) { events.push(record) } },
    async reply(text) { events.push(text); return replyText },
    async isManaged(userId) { strictEqual(userId, incoming.userTelegramId); return false },
  })
  strictEqual(await process(message), replyText)
  const outgoing = events[2] as MessageRecord
  strictEqual(Number.isNaN(Date.parse(outgoing.createdAt)), false)
  deepStrictEqual(events, [incoming, incoming.body, { ...incoming, author: 'bot', body: replyText, createdAt: outgoing.createdAt }])
})

Deno.test('stores an incoming message even when its source cannot receive a reply', async () => {
  const saved: MessageRecord[] = []
  const process = createProcessBotMessage({
    messageRepository: { async save(record) { saved.push(record) } },
    reply: () => { throw new Error('unexpected reply') },
    isManaged: async () => false,
  })
  strictEqual(await process({ incoming }), undefined)
  deepStrictEqual(saved, [incoming])
})

Deno.test('stores incoming messages during takeover and resumes automatic replies after release', async () => {
  const saved: MessageRecord[] = []
  let managed = true
  const process = createProcessBotMessage({
    messageRepository: { async save(record) { saved.push(record) } },
    reply: async () => replyText,
    isManaged: async () => managed,
  })
  strictEqual(await process(message), undefined)
  deepStrictEqual(saved, [incoming])
  managed = false
  strictEqual(await process(message), replyText)
  deepStrictEqual(saved.map(record => record.author), ['test_client', 'test_client', 'bot'])
})

Deno.test('suppresses a reply computed while a manager was connecting', async () => {
  let managed = false
  const saved: MessageRecord[] = []
  const process = createProcessBotMessage({
    messageRepository: { async save(record) { saved.push(record) } },
    async reply() { managed = true; return replyText },
    isManaged: async () => managed,
  })
  strictEqual(await process(message), undefined)
  deepStrictEqual(saved, [incoming])
})
