import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { InboxReader } from '../application/inbox-reader.ts'

export function createSupabaseInboxReader(supabase: SupabaseClient): InboxReader {
  return {
    async listClients(): Promise<unknown> {
      const { data, error } = await supabase.rpc('list_inbox_clients')
      if (error) throw error
      return data
    },
    async readHistory(query) {
      const { data, error } = await supabase.rpc('inbox_message_page', {
        p_client_id: query.clientId, p_created_at: query.createdAt, p_id: query.id, p_direction: query.direction,
      })
      if (error) throw error
      return data ?? []
    },
  }
}
