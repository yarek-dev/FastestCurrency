import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import type { DialogueMessage } from '@backend/supabase/functions/telegram-webhook/application/ports/message-repository.ts'
import { createAnswerKnowledgeQuestion } from '@backend/supabase/functions/telegram-webhook/application/use-cases/answer-knowledge-question.ts'
import { createGeminiKnowledge } from '@backend/supabase/functions/telegram-webhook/infrastructure/gemini/gemini-knowledge.ts'
import { createReplyToQuestion } from '@backend/supabase/functions/telegram-webhook/application/use-cases/reply-to-question.ts'

const update = { message: { chat: { type: 'private', id: 123 }, text: 'Сколько стоит гистероскопия?' } }
const matches = { tariffs: [{ amount: '150.00', currency: 'BYN' }], chunks: [] }
const unusedContext = {
  fitHistory: () => { throw new Error('Should not fit history') },
  rewriteQuestion: () => { throw new Error('Should not rewrite the question') },
}

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
      ...createGeminiKnowledge({
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
      ...unusedContext,
      search: async () => ({ tariffs: [], chunks: [] }),
      answer: () => { throw new Error('Should not generate an answer') },
    }),
  )

  strictEqual(await handler(update.message.text), 'В справочнике не нашёл ответа. Уточните название услуги или свой вопрос.')
})

Deno.test('keeps the newest history within the token budget and uses it for search and answering', async () => {
  const question = 'А по субботам?'
  const searchQuestion = 'Делают ли УЗИ щитовидной железы по субботам?'
  const history: DialogueMessage[] = [
    { role: 'bot', text: 'Earlier topic' },
    { role: 'user', text: 'Сколько стоит УЗИ щитовидной железы?' },
    { role: 'bot', text: 'Стоимость — 150 BYN.' },
  ]
  const checkedLengths: number[] = []
  const prompts: unknown[] = []
  const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
    ...createGeminiKnowledge({
      apiKey: 'test-key',
      model: 'test-model',
      fetchRequest: async (url, init) => {
        const { contents } = JSON.parse(String(init?.body))
        const [historyPart, prompt] = contents[0].parts
        const payload = JSON.parse(historyPart.text)
        if (String(url).endsWith(':countTokens')) {
          checkedLengths.push(payload.history.length)
          strictEqual(prompt, undefined)
          return Response.json({ totalTokens: payload.history.length === 3 ? 2001 : 2000 })
        }
        deepStrictEqual(payload, { history: history.slice(-2) })
        prompts.push(JSON.parse(prompt.text))
        return prompts.length === 1
          ? Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: searchQuestion }] } }] })
          : answerResponse()
      },
    }),
    search: async (query) => {
      strictEqual(query, searchQuestion)
      return matches
    },
  }))

  strictEqual(await handler(question, async () => history), 'Стоимость — 150 BYN.')
  deepStrictEqual(checkedLengths, [3, 1, 2])
  deepStrictEqual(prompts, [{ question }, { question, matches }])
})

Deno.test('uses the current question alone when history cannot fit or token counting fails', async () => {
  for (const countResponse of [Response.json({ totalTokens: 2001 }), new Response(null, { status: 503 })]) {
    const calls: string[] = []
    const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
      ...createGeminiKnowledge({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (url, init) => {
          if (String(url).endsWith(':countTokens')) {
            calls.push('count')
            return countResponse
          }
          calls.push('answer')
          const { contents } = JSON.parse(String(init?.body))
          deepStrictEqual(contents[0].parts, [{ text: JSON.stringify({ question: update.message.text, matches }) }])
          return answerResponse()
        },
      }),
      search: async (query) => {
        strictEqual(query, update.message.text)
        calls.push('search')
        return matches
      },
    }))

    strictEqual(await handler(update.message.text, async () => [{ role: 'user', text: 'A long message' }]), 'Стоимость — 150 BYN.')
    deepStrictEqual(calls, ['count', 'search', 'answer'])
  }
})

Deno.test('a vector search failure gives the user a temporary error message', async () => {
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      ...unusedContext,
      search: () => { throw new Error('Embedding endpoint unavailable') },
      answer: () => { throw new Error('Should not generate an answer') },
    }),
  )

  strictEqual(await handler(update.message.text), 'Справочник временно недоступен. Попробуйте ещё раз позже.')
})

Deno.test('retries a transient Gemini 503 within the same request deadline', async () => {
  const signals: Array<AbortSignal | null | undefined> = []
  const { answer } = createGeminiKnowledge({
    apiKey: 'test-key',
    model: 'test-model',
    fetchRequest: async (_, init) => {
      signals.push(init?.signal)
      return signals.length === 1 ? new Response(null, { status: 503 }) : answerResponse()
    },
  })

  strictEqual(await answer(update.message.text, matches, []), 'Стоимость — 150 BYN.')
  strictEqual(signals.length, 2)
  strictEqual(signals[0], signals[1])
})
