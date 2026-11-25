import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { ManagerOperations } from '../application/manage-conversation.ts'

export function createSupabaseManagerOperations(supabase: SupabaseClient): ManagerOperations {
  return {
    async begin({ clientId, requestId, userId, action, body }) {
      const { data, error } = await supabase.rpc('begin_inbox_manager_action', {
        p_client_id: clientId, p_request_id: requestId, p_actor_id: userId, p_action: action, p_body: body,
      })
      if (error) throw error
      if (data.status === 'ready') return { status: 'ready', destination: data.chat_id }
      if (data.status === 'rate_limited') return { status: 'rate_limited', retryAfter: data.retry_after }
      return data
    },
    async complete({ clientId, requestId }, delivery) {
      const { data, error } = await supabase.rpc('complete_inbox_manager_action', {
        p_client_id: clientId, p_request_id: requestId, p_delivery: delivery,
      })
      if (error) throw error
      return data
    },
  }
}
