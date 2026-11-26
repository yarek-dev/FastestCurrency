import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { KnowledgeMatches } from '../../application/use-cases/answer-knowledge-question.ts'
import { createSupabaseMessageRepository } from './supabase-message-repository.ts'

export function createSupabaseBotData(supabase: SupabaseClient) {
  return {
    messageRepository: createSupabaseMessageRepository(supabase),
    async searchKnowledge(embedding: number[]): Promise<KnowledgeMatches> {
      const { data, error } = await supabase.rpc('search_department_knowledge', {
        p_embedding: JSON.stringify(embedding),
      })
      if (error) throw error
      return data
    },
    async isManaged(userId: string): Promise<boolean> {
      const { data, error } = await supabase.rpc('inbox_manager_is_active', { p_user_telegram_id: userId })
      if (error) throw error
      return data === true
    },
  }
}
