import { deepStrictEqual } from 'node:assert/strict'

import type { MessageRecord } from '@backend/supabase/functions/telegram-webhook/application/ports/message-repository.ts'
import { createProcessTelegramUpdate } from '@backend/supabase/functions/telegram-webhook/application/use-cases/process-telegram-update.ts'

const incomingMessage: MessageRecord = {
  userTelegramId: '123',
  firstName: 'Yaroslav',
  lastName: null,
  author: 'yarek_dev',
  body: 'Как оплатить через ЕРИП?',
  createdAt: '2026-09-17T10:00:00.000Z',
}

const outgoingMessage: MessageRecord = {
  ...incomingMessage,
  author: 'bot',
  body: 'Для оплаты выберите медцентр в дереве услуг ЕРИП.',
  createdAt: '2026-09-17T10:00:01.000Z',
}

Deno.test('stores the incoming message, handles it, and stores the response', async () => {
  const events: string[] = []
  const processUpdate = createProcessTelegramUpdate({
    messageRepository: {
      save(message) {
        events.push(`save:${message.author}`)
        return Promise.resolve()
      },
    },
    handleUpdate() {
      events.push('handle')
      return Promise.resolve('response')
    },
    isManaged: () => Promise.resolve(false),
    toIncomingMessage: () => incomingMessage,
    toOutgoingMessage: () => outgoingMessage,
  })

  const action = await processUpdate('update')

  deepStrictEqual(action, 'response')
  deepStrictEqual(events, ['save:yarek_dev', 'handle', 'save:bot'])
})

Deno.test('does not store an outgoing message when there is no response', async () => {
  const savedMessages: MessageRecord[] = []
  const processUpdate = createProcessTelegramUpdate<string, string>({
    messageRepository: {
      save(message) {
        savedMessages.push(message)
        return Promise.resolve()
      },
    },
    handleUpdate: () => Promise.resolve(undefined),
    isManaged: () => Promise.resolve(false),
    toIncomingMessage: () => incomingMessage,
    toOutgoingMessage: () => outgoingMessage,
  })

  await processUpdate('update')

  deepStrictEqual(savedMessages, [incomingMessage])
})

Deno.test('stores incoming messages during takeover and resumes automatic replies after release', async () => {
  const saved: MessageRecord[] = []
  let managed = true
  const processUpdate = createProcessTelegramUpdate({
    messageRepository: { async save(message) { saved.push(message) } },
    handleUpdate: () => Promise.resolve('automatic reply'),
    isManaged: () => Promise.resolve(managed),
    toIncomingMessage: () => incomingMessage,
    toOutgoingMessage: () => outgoingMessage,
  })

  deepStrictEqual(await processUpdate('message'), undefined)
  deepStrictEqual(saved, [incomingMessage])
  managed = false
  deepStrictEqual(await processUpdate('message'), 'automatic reply')
  deepStrictEqual(saved, [incomingMessage, incomingMessage, outgoingMessage])
})

Deno.test('suppresses a reply computed while a manager was connecting', async () => {
  let managed = false
  const saved: MessageRecord[] = []
  const processUpdate = createProcessTelegramUpdate({
    messageRepository: { async save(message) { saved.push(message) } },
    async handleUpdate() {
      managed = true
      return 'automatic reply'
    },
    isManaged: () => Promise.resolve(managed),
    toIncomingMessage: () => incomingMessage,
    toOutgoingMessage: () => outgoingMessage,
  })
  deepStrictEqual(await processUpdate('message'), undefined)
  deepStrictEqual(saved, [incomingMessage])
})
