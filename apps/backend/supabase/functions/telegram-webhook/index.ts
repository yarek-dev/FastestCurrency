import '@supabase/functions-js/edge-runtime.d.ts'
import { createSupabaseAdminClient } from '../_shared/infrastructure/supabase-admin.ts'
import { createAnswerKnowledgeQuestion } from './application/use-cases/answer-knowledge-question.ts'
import { createProcessBotMessage } from './application/use-cases/process-bot-message.ts'
import { createReplyToQuestion } from './application/use-cases/reply-to-question.ts'
import { createSupabaseBotData } from './infrastructure/database/supabase-bot-data.ts'
import { createGeminiEmbeddings } from './infrastructure/gemini/gemini-embeddings.ts'
import { createGeminiKnowledge } from './infrastructure/gemini/gemini-knowledge.ts'
import { createTelegramWebhookController } from './presentation/http/telegram-webhook-controller.ts'
import { createTelegramUpdateAdapter } from './presentation/telegram/telegram-update-adapter.ts'

const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim()
const geminiModel = Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-3.5-flash-lite'
const supabase = createSupabaseAdminClient()
const botData = supabase ? createSupabaseBotData(supabase) : undefined
const embeddings = geminiApiKey ? createGeminiEmbeddings(geminiApiKey) : undefined
const answerQuestion = botData && geminiApiKey && embeddings
  ? createAnswerKnowledgeQuestion({
    ...createGeminiKnowledge({ apiKey: geminiApiKey, model: geminiModel }),
    async search(question) {
      return await botData.searchKnowledge(await embeddings.embedQuestion(question))
    },
  })
  : async () => { throw new Error('Knowledge answer is not configured') }

const processTelegramUpdate = botData
  ? createTelegramUpdateAdapter(createProcessBotMessage({
    messageRepository: botData.messageRepository,
    reply: createReplyToQuestion(answerQuestion),
    isManaged: botData.isManaged,
  }))
  : undefined

export default { fetch: createTelegramWebhookController({ webhookSecret, processTelegramUpdate }) }
