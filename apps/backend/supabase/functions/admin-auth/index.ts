import { createAdminAuthHandler } from './presentation/http/handler.ts'
import { createAdminSession } from './application/admin-session.ts'
import { createSupabaseAuthExchange } from './infrastructure/supabase-auth-exchange.ts'
import { createSupabaseAdminClient } from '../_shared/infrastructure/supabase-admin.ts'
import { createSupabaseInboxAccess } from '../_shared/infrastructure/supabase-inbox-access.ts'

const supabase = createSupabaseAdminClient()
const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')
const apiKey = Deno.env.get('SUPABASE_ANON_KEY')

export default {
  fetch: createAdminAuthHandler(url && apiKey && supabase ? createAdminSession(
    createSupabaseAuthExchange(url + '/auth/v1', apiKey),
    createSupabaseInboxAccess(supabase).checkGrant,
  ) : undefined),
}
