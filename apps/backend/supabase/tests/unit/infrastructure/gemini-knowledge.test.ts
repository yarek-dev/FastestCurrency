import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { createAnswerKnowledgeQuestion } from '@backend/supabase/functions/telegram-webhook/application/use-cases/answer-knowledge-question.ts'
import { createGeminiKnowledgeAnswer } from '@backend/supabase/functions/telegram-webhook/infrastructure/gemini/gemini-knowledge.ts'
import { createReplyToQuestion } from '@backend/supabase/functions/telegram-webhook/application/use-cases/reply-to-question.ts'

const update = { message: { chat: { type: 'private', id: 123 }, text: 'Сколько стоит гистероскопия?' } }
const matches = { tariffs: [{ amount: '150.00', currency: 'BYN' }], chunks: [] }

function answerResponse() {
  return Response.json({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ thought: true, text: 'hidden' }, { text: 'Стоимость — 150 BYN.' }] },
    }],
  })
}

Deno.test('searches with the original question and generates one grounded reply', async () => {
  const calls: string[] = []
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      search: async (question) => {
        strictEqual(question, update.message.text)
        calls.push('search')
        return matches
      },
      answer: createGeminiKnowledgeAnswer({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (url, init) => {
          calls.push('generate')
          strictEqual(url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent')
          strictEqual(new Headers(init?.headers).get('x-goog-api-key'), 'test-key')
          const request = JSON.parse(String(init?.body))
          deepStrictEqual(JSON.parse(request.contents[0].parts[0].text), { question: update.message.text, matches })
          strictEqual(request.tools, undefined)
          return answerResponse()
        },
      }),
    }),
  )

  strictEqual(await handler(update.message.text), 'Стоимость — 150 BYN.')
  deepStrictEqual(calls, ['search', 'generate'])
})

Deno.test('an empty vector search asks for clarification without calling the generation model', async () => {
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      search: async () => ({ tariffs: [], chunks: [] }),
      answer: () => { throw new Error('Should not generate an answer') },
    }),
  )

  strictEqual(await handler(update.message.text), 'В справочнике не нашёл ответа. Уточните название услуги или свой вопрос.')
})

Deno.test('a vector search failure gives the user a temporary error message', async () => {
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      search: () => { throw new Error('Embedding endpoint unavailable') },
      answer: () => { throw new Error('Should not generate an answer') },
    }),
  )

  strictEqual(await handler(update.message.text), 'Справочник временно недоступен. Попробуйте ещё раз позже.')
})

Deno.test('retries a transient Gemini 503 within the same request deadline', async () => {
  const signals: Array<AbortSignal | null | undefined> = []
  const answer = createGeminiKnowledgeAnswer({
    apiKey: 'test-key',
    model: 'test-model',
    fetchRequest: async (_, init) => {
      signals.push(init?.signal)
      return signals.length === 1 ? new Response(null, { status: 503 }) : answerResponse()
    },
  })

  strictEqual(await answer(update.message.text, matches), 'Стоимость — 150 BYN.')
  strictEqual(signals.length, 2)
  strictEqual(signals[0], signals[1])
})
