import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { localSupabase } from './local-supabase'

function checked<T>({ data, error }: { data: T; error: { message: string } | null }, operation: string): T {
  if (error) throw new Error(`${operation}: ${error.message}`)
  return data
}

interface InboxFixture {
  url: string
  publicKey: string
  email: string
  password: string
  clientId: string
  clientName: string
  addMessages: (bodies: string[], createdAt?: string) => Promise<void>
  revokeInboxAccess: () => Promise<void>
}

export const test = base.extend<{ inbox: InboxFixture }>({
  async inbox({}, use) {
    const { url, publicKey, serviceKey } = localSupabase()
    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const fixtureId = randomUUID()
    const email = `inbox-${fixtureId}@example.test`
    const password = randomUUID()
    const clientName = `Клиент ${fixtureId}`
    const { user } = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }), 'create test user')
    if (!user) throw new Error('Supabase did not return the test user')

    let clientId: string | undefined
    try {
      checked(await db.from('inbox_admins').insert({ user_id: user.id }), 'grant inbox access')
      const client = checked(await db.from('clients').insert({
        first_name: clientName, user_telegram_id: fixtureId,
      }).select('id').single(), 'create test client')
      if (!client) throw new Error('Supabase did not return the test client')
      clientId = String(client.id)
      await use({
        url, publicKey, email, password, clientId, clientName,
        async addMessages(bodies, createdAt = new Date().toISOString()) {
          checked(await db.from('messages').insert(bodies.map(body => ({
            client_id: clientId, messenger_user_id: fixtureId, messenger_type: 'telegram',
            author: 'test_client', body, created_at: createdAt,
          }))), 'seed test messages')
        },
        async revokeInboxAccess() {
          checked(await db.from('inbox_admins').delete().eq('user_id', user.id), 'revoke inbox access')
        },
      })
    } finally {
      const cleanup: Promise<void>[] = [
        db.auth.admin.deleteUser(user.id).then(result => { checked(result, 'delete test user') }),
      ]
      if (clientId) {
        const id = clientId
        cleanup.push((async () => {
          checked(await db.from('messages').delete().eq('client_id', id), 'delete test messages')
          checked(await db.from('clients').delete().eq('id', id), 'delete test client')
        })())
      }
      await Promise.all(cleanup)
    }
  },
})

export { expect }
