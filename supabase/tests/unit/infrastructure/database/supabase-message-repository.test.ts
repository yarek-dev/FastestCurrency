import { deepStrictEqual, rejects } from 'node:assert/strict'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { createSupabaseMessageRepository } from '../../../../functions/telegram-webhook/infrastructure/database/supabase-message-repository.ts'

Deno.test('sends a Telegram message to the transactional RPC', async () => {
  let receivedName: string | undefined
  let receivedArguments: unknown
  const supabase = {
    rpc(name: string, args: unknown) {
      receivedName = name
      receivedArguments = args
      return Promise.resolve({ data: 10, error: null })
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseMessageRepository(supabase)

  await repository.save({
    userTelegramId: '123',
    firstName: 'Yaroslav',
    lastName: null,
    author: 'yarek_dev',
    body: '/start',
    createdAt: '2026-09-17T10:00:00.000Z',
  })

  deepStrictEqual(receivedName, 'save_message')
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
