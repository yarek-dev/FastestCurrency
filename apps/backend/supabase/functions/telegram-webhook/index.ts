import '@supabase/functions-js/edge-runtime.d.ts'
import { createSupabaseAdminClient } from '../_shared/supabase-admin.ts'
import { createAnswerKnowledgeQuestion } from './application/use-cases/answer-knowledge-question.ts'
import { createProcessTelegramUpdate } from './application/use-cases/process-telegram-update.ts'
import { createSupabaseMessageRepository } from './infrastructure/database/supabase-message-repository.ts'
import { createGeminiKnowledgeLookup } from './infrastructure/gemini/gemini-knowledge.ts'
import { createTelegramWebhookController } from './presentation/http/telegram-webhook-controller.ts'
import { createTelegramKnowledgeHandler } from './presentation/telegram/handlers/telegram-knowledge-handler.ts'
import {
  getPrivateTelegramUserId,
  toIncomingTelegramMessage,
  toOutgoingTelegramMessage,
} from './presentation/telegram/telegram-message-mapper.ts'

const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim()
const geminiModel = Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-3.5-flash-lite'

const supabase = createSupabaseAdminClient()
const answerQuestion = supabase && geminiApiKey
  ? createAnswerKnowledgeQuestion({
    selectQuery: createGeminiKnowledgeLookup({ apiKey: geminiApiKey, model: geminiModel }),
    async search(query) {
      const { data, error } = await supabase.rpc('search_knowledge', { p_query: query })
      if (error) throw error
      return data
    },
  })
  : async () => { throw new Error('Knowledge answer is not configured') }
const handleTelegramUpdate = createTelegramKnowledgeHandler({ answerQuestion })
const messageRepository = supabase
  ? createSupabaseMessageRepository(supabase)
  : undefined
const processTelegramUpdate = supabase && messageRepository
  ? createProcessTelegramUpdate({
    messageRepository,
    handleUpdate: handleTelegramUpdate,
    async isManaged(update) {
      const userId = getPrivateTelegramUserId(update)
      if (!userId) return false
      const { data, error } = await supabase.rpc('inbox_manager_is_active', { p_user_telegram_id: userId })
      if (error) throw error
      return data === true
    },
    toIncomingMessage: toIncomingTelegramMessage,
    toOutgoingMessage: toOutgoingTelegramMessage,
  })
  : undefined
const handleRequest = createTelegramWebhookController({
  webhookSecret,
  processTelegramUpdate,
})

export default { fetch: handleRequest }
