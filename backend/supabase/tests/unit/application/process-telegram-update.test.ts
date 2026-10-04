import { deepStrictEqual } from 'node:assert/strict'

import type { MessageRecord } from '../../../functions/telegram-webhook/application/ports/message-repository.ts'
import { createProcessTelegramUpdate } from '../../../functions/telegram-webhook/application/use-cases/process-telegram-update.ts'

const incomingMessage: MessageRecord = {
  userTelegramId: '123',
  firstName: 'Yaroslav',
  lastName: null,
  author: 'yarek_dev',
  body: 'EUR USD',
  createdAt: '2026-09-17T10:00:00.000Z',
}

const outgoingMessage: MessageRecord = {
  ...incomingMessage,
  author: 'bot',
  body: '1 EUR = 1.1 USD',
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
    toIncomingMessage: () => incomingMessage,
    toOutgoingMessage: () => outgoingMessage,
  })

  await processUpdate('update')

  deepStrictEqual(savedMessages, [incomingMessage])
})
