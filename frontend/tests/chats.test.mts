import assert from 'node:assert/strict'
import { test } from 'vitest'
import { compareMessages, toChats, type ClientRecord, type MessageRecord } from '../src/modules/chats/api/chats.ts'

const client: ClientRecord = {
  id: 1, user_telegram_id: '123', first_name: 'Анна', last_name: null,
  last_message_at: '2026-10-05T10:00:00Z',
}
const message: MessageRecord = {
  id: 10, client_id: 1, created_at: '2026-10-05T10:00:00Z', author: 'client', body: 'Привет',
}

test('message order preserves microseconds and bigint tie breakers', () => {
  assert.ok(compareMessages({ ...message, id: '9007199254740993' }, { ...message, id: '9007199254740992' }) > 0)
  assert.ok(compareMessages({ ...message, created_at: '2026-10-05T10:00:00.123455Z' },
    { ...message, id: 9, created_at: '2026-10-05T10:00:00.123456Z' }) < 0)
})

test('messages are grouped by client and displayed chronologically', () => {
  const chats = toChats({
    clients: [client, { ...client, id: 2 }],
    messages: [
      message,
      { ...message, id: 9, author: 'bot' },
      { ...message, id: 8, created_at: '2026-10-04T10:00:00Z' },
      { ...message, id: 11, client_id: 2 },
    ],
  })
  assert.deepEqual(chats[0].messages.map(item => item.id), ['8', '9', '10'])
  assert.equal(chats[0].messages[1].author, 'bot')
  assert.deepEqual(chats[1].messages.map(item => item.id), ['11'])
})

test('clients are displayed by last activity without modifying source arrays', () => {
  const clients = [client, { ...client, id: 2, last_message_at: '2026-10-05T11:00:00Z' }]
  const chats = toChats({ clients, messages: [message] })
  assert.equal(chats[0].id, '2')
  assert.equal(chats[1].messages[0].text, 'Привет')
  assert.equal(clients[0].id, 1)
})
