import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { createTelegramWebhookController } from '@backend/supabase/functions/telegram-webhook/presentation/http/telegram-webhook-controller.ts'

const webhookUrl = 'https://example.test/telegram-webhook'

Deno.test('rejects requests before processing when the webhook secret or payload is invalid', async () => {
  let updates = 0
  const handle = createTelegramWebhookController({
    webhookSecret: 'test-secret',
    async processTelegramUpdate() {
      updates++
      return undefined
    },
  })
  for (const [secret, body, status] of [['wrong', '{}', 401], ['test-secret', '{', 400], ['test-secret', 'null', 400]] as const) {
    const response = await handle(new Request(webhookUrl, {
      method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body,
    }))
    strictEqual(response.status, status)
  }
  strictEqual(updates, 0)
})

Deno.test('returns the application reply as a Telegram webhook action', async () => {
  const update = { update_id: 42, message: { chat: { id: 123, type: 'private' }, text: '/start' } }
  const action = { method: 'sendMessage', chat_id: 123, text: 'Здравствуйте!' } as const
  const handle = createTelegramWebhookController({
    webhookSecret: 'test-secret',
    async processTelegramUpdate(received) {
      deepStrictEqual(received, update)
      return action
    },
  })
  const response = await handle(new Request(webhookUrl, {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, body: JSON.stringify(update),
  }))
  strictEqual(response.status, 200)
  deepStrictEqual(await response.json(), action)
})
