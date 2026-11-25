import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { CheckInboxGrant, ResolveIdentity } from '../application/inbox-access.ts'

export function createSupabaseInboxAccess(supabase: SupabaseClient) {
  const checkGrant: CheckInboxGrant = async userId => {
    const { data, error } = await supabase.from('inbox_admins').select('user_id').eq('user_id', userId).maybeSingle()
    if (error) return 'unavailable'
    return data ? 'allowed' : 'forbidden'
  }
  const resolveIdentity: ResolveIdentity = async token => {
    const { data, error } = await supabase.auth.getUser(token)
    if (error) {
      return { status: [400, 401, 403].includes(error.status ?? 0) ? 'unauthorized' : 'unavailable' }
    }
    return data.user ? { status: 'resolved', userId: data.user.id } : { status: 'unauthorized' }
  }
  return { checkGrant, resolveIdentity }
}
