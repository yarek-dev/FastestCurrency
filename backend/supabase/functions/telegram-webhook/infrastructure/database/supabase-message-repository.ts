import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import type { MessageRepository } from '../../application/ports/message-repository.ts'

export function createSupabaseMessageRepository(
  supabase: SupabaseClient,
): MessageRepository {
  return {
    async save(message) {
      const { error } = await supabase.rpc('save_message', {
        p_user_telegram_id: message.userTelegramId,
        p_first_name: message.firstName,
        p_last_name: message.lastName,
        p_author: message.author,
        p_body: message.body,
        p_messenger_type: 'telegram',
        p_created_at: message.createdAt,
      })

      if (error) {
        throw new Error('Failed to save Telegram message', {
          cause: error,
        })
      }
    },
  }
}
