import { createAdminAuthHandler } from './handler.ts'
import { createSupabaseAdminClient } from '../_shared/supabase-admin.ts'
import { inboxAdminStatus } from '../_shared/inbox-access.ts'

const supabase = createSupabaseAdminClient()
const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')
const apiKey = Deno.env.get('SUPABASE_ANON_KEY')

export default {
  fetch: createAdminAuthHandler(url && apiKey && supabase ? {
    authUrl: url + '/auth/v1',
    apiKey,
    checkAdmin: userId => inboxAdminStatus(supabase, userId),
  } : undefined),
}
