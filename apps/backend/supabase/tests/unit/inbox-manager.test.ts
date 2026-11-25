import { deepStrictEqual, equal } from 'node:assert/strict'
import { createInboxManagerHandler } from '../../functions/messages/presentation/http/manager-handler.ts'
import { createManageConversation, type DeliverManagerMessage, type ManagerOperations } from '../../functions/messages/application/manage-conversation.ts'
import type { IdentifyInboxAdmin } from '../../functions/_shared/presentation/http/inbox-access.ts'
import { createTelegramSender } from '../../functions/messages/infrastructure/telegram-sender.ts'

type Dependencies = ManagerOperations & { identify: IdentifyInboxAdmin; deliver: DeliverManagerMessage }
const clientId = '9007199254741000'
const requestId = '00000000-0000-4000-8000-000000000001'

function request(action: string, text?: string) {
  return new Request('https://example.test/functions/v1/messages', {
    method: 'POST',
    body: JSON.stringify({ clientId, requestId, action, text, chatId: '999', userId: 'forged' }),
  })
}

function fixture(overrides: Partial<Dependencies> = {}) {
  const events: unknown[] = []
  const dependencies: Dependencies = {
    identify: () => Promise.resolve({ status: 200, userId: 'verified-admin' }),
    async begin(operation) {
      events.push(operation)
      return { status: 'ready', destination: '123' }
    },
    async deliver(...args) {
      events.push(args)
      return 'done'
    },
    async complete(operation, outcome) {
      events.push({ ...operation, outcome })
      return { id: '5' }
    },
    ...overrides,
  }
  const handle = createInboxManagerHandler(dependencies.identify, createManageConversation(dependencies, dependencies.deliver))
  return { handle, events }
}

Deno.test('uses the confirmed JWT identity and server-resolved Telegram chat and records delivery', async () => {
  const { handle, events } = fixture()
  const response = await handle(request('send', '  Здравствуйте!  '))
  equal(response.status, 200)
  deepStrictEqual(await response.json(), { ok: true, message: { id: '5' } })
  deepStrictEqual(events, [
    { clientId, requestId, action: 'send', body: 'Здравствуйте!', userId: 'verified-admin' },
    ['123', { action: 'send', body: 'Здравствуйте!' }],
    { clientId, requestId, outcome: 'done' },
  ])
})

Deno.test('sends the connect and finish notices as specified', async () => {
  const { handle, events } = fixture()
  equal((await handle(request('connect'))).status, 200)
  equal((await handle(request('finish'))).status, 200)
  deepStrictEqual(events[1], ['123', { action: 'connect', body: 'Менеджер подключился' }])
  deepStrictEqual(events[4], ['123', { action: 'finish', body: 'Менеджер завершил диалог' }])
})

Deno.test('rejects unauthorized requests, conflicting ownership and duplicate delivery', async () => {
  for (const status of [401, 403] as const) {
    const { handle, events } = fixture({ identify: () => Promise.resolve({ status }) })
    equal((await handle(request('connect'))).status, status)
    deepStrictEqual(events, [])
  }
  for (const [status, expected] of [['conflict', 409], ['pending', 409], ['done', 200], ['unknown', 502]] as const) {
    const { handle, events } = fixture({ begin: () => Promise.resolve({ status }) })
    equal((await handle(request('send', 'Текст'))).status, expected)
    deepStrictEqual(events, [])
  }
})

Deno.test('validates action and text before reserving delivery', async () => {
  const { handle, events } = fixture()
  equal((await handle(request('other'))).status, 400)
  equal((await handle(request('send', '   '))).status, 400)
  equal((await handle(request('send', 'a'.repeat(4084)))).status, 400)
  deepStrictEqual(events, [])
  equal((await handle(request('send', 'a'.repeat(4083)))).status, 200)
})

Deno.test('returns 429 and skips Telegram delivery when the database quota is full', async () => {
  const { handle, events } = fixture({
    begin: () => Promise.resolve({ status: 'rate_limited', retryAfter: 42 }),
  })
  const response = await handle(request('send', 'Текст'))
  equal(response.status, 429)
  equal(response.headers.get('Retry-After'), '42')
  equal(response.headers.get('Access-Control-Expose-Headers'), 'Retry-After')
  deepStrictEqual(await response.json(), { error: 'rate_limited', retryAfter: 42 })
  deepStrictEqual(events, [])
})

Deno.test('distinguishes Telegram rejection from an ambiguous delivery', async () => {
  for (const outcome of ['failed', 'unknown'] as const) {
    const { handle, events } = fixture({
      deliver: () => outcome === 'failed' ? Promise.resolve(outcome) : Promise.reject(new Error('timeout')),
    })
    const response = await handle(request('connect'))
    equal(response.status, 502)
    equal((await response.json()).error, outcome === 'failed' ? 'telegram_rejected' : 'delivery_unknown')
    deepStrictEqual(events[1], { clientId, requestId, outcome })
  }
})

Deno.test('Telegram sender bolds only the heading and sends the reply as literal text', async () => {
  const send = createTelegramSender('test', async (_url, options) => {
    deepStrictEqual(JSON.parse(String(options?.body)), {
      chat_id: '123',
      text: '🎧 Менеджер\n\n<b>Текст & _</b>',
      entities: [{ type: 'bold', offset: 0, length: 11 }],
    })
    return Response.json({ ok: true })
  })
  equal(await send('123', { action: 'send', body: '<b>Текст & _</b>' }), 'done')
})

Deno.test('Telegram sender includes the notice marker and italicizes its body', async () => {
  const messages: unknown[] = []
  const send = createTelegramSender('test', async (_url, options) => {
    messages.push(JSON.parse(String(options?.body)))
    return Response.json({ ok: true })
  })
  await send('123', { action: 'connect', body: 'Вход' })
  await send('123', { action: 'finish', body: 'Выход' })
  deepStrictEqual(messages, [
    { chat_id: '123', text: '🟢 Вход', entities: [{ type: 'italic', offset: 3, length: 4 }] },
    { chat_id: '123', text: '⚪ Выход', entities: [{ type: 'italic', offset: 2, length: 5 }] },
  ])
})
