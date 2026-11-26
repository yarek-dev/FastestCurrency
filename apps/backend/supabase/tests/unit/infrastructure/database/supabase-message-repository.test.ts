import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { createSupabaseMessageRepository } from '@backend/supabase/functions/telegram-webhook/infrastructure/database/supabase-message-repository.ts'

Deno.test('sends a Telegram message to the transactional RPC', async () => {
  let receivedName: string | undefined
  let receivedArguments: unknown
  const supabase = {
    rpc(name: string, args: unknown) {
      receivedName = name
      receivedArguments = args
      return Promise.resolve({ data: '9007199254740993', error: null })
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseMessageRepository(supabase)

  const savedId = await repository.save({
    userTelegramId: '123',
    firstName: 'Yaroslav',
    lastName: null,
    author: 'yarek_dev',
    body: '/start',
    createdAt: '2026-09-17T10:00:00.000Z',
  })

  strictEqual(savedId, '9007199254740993')
  strictEqual(receivedName, 'save_message_text_id')
  deepStrictEqual(receivedArguments, {
    p_user_telegram_id: '123',
    p_first_name: 'Yaroslav',
    p_last_name: null,
    p_author: 'yarek_dev',
    p_body: '/start',
    p_messenger_type: 'telegram',
    p_created_at: '2026-09-17T10:00:00.000Z',
  })
})

Deno.test('rejects when the transactional RPC fails', async () => {
  const supabase = {
    rpc() {
      return Promise.resolve({
        data: null,
        error: { message: 'database unavailable' },
      })
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseMessageRepository(supabase)

  await rejects(
    () =>
      repository.save({
        userTelegramId: '123',
        firstName: 'Yaroslav',
        lastName: null,
        author: 'bot',
        body: 'Hello!',
        createdAt: '2026-09-17T10:00:01.000Z',
      }),
    /Failed to save Telegram message/,
  )
})

Deno.test('reads only the ten previous text messages from the same Telegram conversation', async () => {
  const supabase = createClient('https://supabase.example', 'test-key', {
    auth: { persistSession: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input))
      const filters = url.searchParams
      strictEqual(url.pathname, '/rest/v1/messages')
      strictEqual(filters.get('select'), 'author,body,clients!inner()')
      strictEqual(filters.get('clients.user_telegram_id'), 'eq.123')
      strictEqual(filters.get('messenger_type'), 'eq.telegram')
      strictEqual(filters.get('manager_kind'), 'is.null')
      deepStrictEqual(filters.getAll('body'), ['neq.'])
      strictEqual(filters.get('id'), 'lt.9007199254740993')
      strictEqual(filters.get('created_at'), 'lt.2026-09-17T10:00:01.000Z')
      strictEqual(filters.get('order'), 'created_at.desc,id.desc')
      strictEqual(filters.get('limit'), '10')
      return Response.json([
        { author: 'bot', body: 'Previous reply' },
        { author: 'yarek_dev', body: 'Previous question' },
      ])
    } },
  })
  const repository = createSupabaseMessageRepository(supabase)

  deepStrictEqual(await repository.readPrevious({
    userTelegramId: '123',
    firstName: null,
    lastName: null,
    author: 'yarek_dev',
    body: 'Current question',
    createdAt: '2026-09-17T10:00:00.000Z',
  }, '9007199254740993'), [
    { role: 'user', text: 'Previous question' },
    { role: 'bot', text: 'Previous reply' },
  ])
})
