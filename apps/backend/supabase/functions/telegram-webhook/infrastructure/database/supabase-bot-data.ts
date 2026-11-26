import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { KnowledgeMatches, PaidServiceGuidance, PaidServiceGuidanceKey } from '../../application/use-cases/answer-knowledge-question.ts'
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
    async readPaidServiceGuidance(keys: PaidServiceGuidanceKey[]): Promise<PaidServiceGuidance[]> {
      const { data, error } = await supabase.from('paid_services')
        .select('guidance_key,kind,title,body,section,audience,unit,price_label,price_type,amount,max_amount,effective_from')
        .in('guidance_key', keys)
        .returns<PaidServiceGuidance[]>()
      if (error) throw error
      if (data.length !== keys.length) throw new Error('A configured paid service record is missing')
      return data
    },
    async isManaged(userId: string): Promise<boolean> {
      const { data, error } = await supabase.rpc('inbox_manager_is_active', { p_user_telegram_id: userId })
      if (error) throw error
      return data === true
    },
  }
}
