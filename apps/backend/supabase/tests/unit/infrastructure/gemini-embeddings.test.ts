import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict'
import { createGeminiEmbeddings } from '@backend/supabase/functions/telegram-webhook/infrastructure/gemini/gemini-embeddings.ts'

const vector = Array.from({ length: 768 }, (_, index) => index / 768)

Deno.test('embeds the original question with the configured Gemini retrieval format', async () => {
  const embeddings = createGeminiEmbeddings('test-key', async (url, init) => {
    strictEqual(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent')
    strictEqual(new Headers(init?.headers).get('x-goog-api-key'), 'test-key')
    deepStrictEqual(JSON.parse(String(init?.body)), {
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: 'task: question answering | query: Как оплатить договор?' }] },
      outputDimensionality: 768,
    })
    return Response.json({ embedding: { values: vector } })
  })

  deepStrictEqual(await embeddings.embedQuestion('Как оплатить договор?'), vector)
})

Deno.test('embeds documents in order and rejects an incomplete batch', async () => {
  const secondVector = vector.toReversed()
  let incomplete = false
  const embeddings = createGeminiEmbeddings('test-key', async (url, init) => {
    strictEqual(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents')
    const body = JSON.parse(String(init?.body))
    deepStrictEqual(body.requests.map((request: { content: { parts: Array<{ text: string }> } }) =>
      request.content.parts[0].text), ['title: Первый | text: Текст 1', 'title: Второй | text: Текст 2'])
    return Response.json({
      embeddings: incomplete ? [{ values: vector }] : [{ values: vector }, { values: secondVector }],
    })
  })
  const documents = ['title: Первый | text: Текст 1', 'title: Второй | text: Текст 2']

  deepStrictEqual(await embeddings.embedDocuments(documents), [vector, secondVector])
  incomplete = true
  await rejects(embeddings.embedDocuments(documents), /wrong number of embeddings/)
})

Deno.test('rejects malformed vectors', async () => {
  const embeddings = createGeminiEmbeddings('test-key', async () =>
    Response.json({ embedding: { values: [1, 2, 3] } }))
  await rejects(embeddings.embedQuestion('Вопрос'), /invalid embedding/)
})

Deno.test('retries a rate-limited document batch using Retry-After', async () => {
  let requests = 0
  const embeddings = createGeminiEmbeddings('test-key', async () => {
    requests++
    return requests === 1
      ? new Response(null, { status: 429, headers: { 'retry-after': '0' } })
      : Response.json({ embeddings: [{ values: vector }] })
  })

  deepStrictEqual(await embeddings.embedDocuments(['title: Тест | text: Текст']), [vector])
  strictEqual(requests, 2)
})
