import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { createAnswerKnowledgeQuestion } from '@backend/supabase/functions/telegram-webhook/application/use-cases/answer-knowledge-question.ts'
import { createGeminiKnowledgeLookup } from '@backend/supabase/functions/telegram-webhook/infrastructure/gemini/gemini-knowledge.ts'
import { createTelegramKnowledgeHandler } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/handlers/telegram-knowledge-handler.ts'

const update = { message: { chat: { type: 'private', id: 123 }, text: 'Сколько стоит гистероскопия?' } }
const toolContent = {
  role: 'model',
  parts: [{
    functionCall: { name: 'search_knowledge', args: { query: 'гистероскопия' }, id: 'lookup-1' },
    thoughtSignature: 'opaque-signature',
  }],
}

Deno.test('Telegram answers with the result of a Gemini lookup against the knowledge base', async () => {
  const requests: Array<Record<string, unknown>> = []
  const matches = { tariffs: [{ amount: '150.00', currency: 'BYN' }], chunks: [] }
  const handler = createTelegramKnowledgeHandler({
    answerCallbackQuery: async () => {},
    answerQuestion: createAnswerKnowledgeQuestion({
      selectQuery: createGeminiKnowledgeLookup({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (url, init) => {
          strictEqual(url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent')
          strictEqual(new Headers(init?.headers).get('x-goog-api-key'), 'test-key')
          requests.push(JSON.parse(String(init?.body)))
          return Response.json({
            candidates: [requests.length === 1
              ? { content: toolContent }
              : { finishReason: 'STOP', content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Стоимость — 150 BYN.' }] } }],
          })
        },
      }),
      search: async (query) => {
        strictEqual(query, 'гистероскопия')
        return matches
      },
    }),
  })

  deepStrictEqual(await handler(update), { method: 'sendMessage', chat_id: 123, text: 'Стоимость — 150 BYN.' })
  deepStrictEqual(requests[0].toolConfig, { functionCallingConfig: { mode: 'ANY' } })
  deepStrictEqual(requests[1].toolConfig, { functionCallingConfig: { mode: 'NONE' } })
  deepStrictEqual(requests[1].contents, [
    { role: 'user', parts: [{ text: update.message.text }] },
    toolContent,
    { role: 'user', parts: [{ functionResponse: { name: 'search_knowledge', id: 'lookup-1', response: matches } }] },
  ])
})

Deno.test('an empty search asks for clarification without generating an ungrounded answer', async () => {
  const handler = createTelegramKnowledgeHandler({
    answerCallbackQuery: async () => {},
    answerQuestion: createAnswerKnowledgeQuestion({
      selectQuery: async () => ({
        query: 'unknown',
        answer: () => { throw new Error('Should not generate an answer') },
      }),
      search: async () => ({ tariffs: [], chunks: [] }),
    }),
  })

  deepStrictEqual(await handler(update), {
    method: 'sendMessage',
    chat_id: 123,
    text: 'В справочнике не нашёл ответа. Уточните название услуги или свой вопрос.',
  })
})

Deno.test('a Gemini HTTP failure gives the user a temporary error message', async () => {
  const handler = createTelegramKnowledgeHandler({
    answerCallbackQuery: async () => {},
    answerQuestion: createAnswerKnowledgeQuestion({
      selectQuery: createGeminiKnowledgeLookup({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async () => new Response(null, { status: 429 }),
      }),
      search: () => { throw new Error('Should not search after a failed model request') },
    }),
  })
  deepStrictEqual(await handler(update), {
    method: 'sendMessage',
    chat_id: 123,
    text: 'Справочник временно недоступен. Попробуйте ещё раз позже.',
  })
})
