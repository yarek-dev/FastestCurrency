import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import type { MessageRepository } from '../../application/ports/message-repository.ts'

export function createSupabaseMessageRepository(
  supabase: SupabaseClient,
): MessageRepository {
  return {
    async save(message) {
      const { data, error } = await supabase.rpc('save_message_text_id', {
        p_user_telegram_id: message.userTelegramId,
        p_first_name: message.firstName,
        p_last_name: message.lastName,
        p_author: message.author,
        p_body: message.body,
        p_messenger_type: 'telegram',
        p_created_at: message.createdAt,
      })

      if (error || typeof data !== 'string') {
        throw new Error('Failed to save Telegram message', {
          cause: error,
        })
      }
      return data
    },
    async readPrevious(message, messageId) {
      // Telegram timestamps have second precision, so a preceding bot reply can have a later timestamp in the same second.
      const endOfSecond = new Date(Date.parse(message.createdAt) + 1000).toISOString()
      const { data, error } = await supabase
        .from('messages')
        .select('author, body, clients!inner()')
        .eq('clients.user_telegram_id', message.userTelegramId)
        .eq('messenger_type', 'telegram')
        .is('manager_kind', null)
        .neq('body', '')
        .lt('created_at', endOfSecond)
        .lt('id', messageId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(10)

      if (error) throw error
      return data.reverse().map(({ author, body }) => ({
        role: author === 'bot' ? 'bot' : 'user',
        text: body,
      }))
    },
  }
}
