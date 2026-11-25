import { deepStrictEqual } from 'node:assert/strict'
import { createResolveInboxAdmin } from '@backend/supabase/functions/_shared/application/inbox-access.ts'

Deno.test('checks the inbox grant only for a resolved identity and uses its user ID', async () => {
  const checkedIdentities: string[] = []
  const resolveAdmin = createResolveInboxAdmin(
    async token => token === 'valid' ? { status: 'resolved', userId: 'admin' } : { status: 'unauthorized' },
    async userId => { checkedIdentities.push(userId); return 'allowed' },
  )
  deepStrictEqual(await resolveAdmin('invalid'), { status: 'unauthorized' })
  deepStrictEqual(await resolveAdmin('valid'), { status: 'resolved', userId: 'admin' })
  deepStrictEqual(checkedIdentities, ['admin'])
})
