const model = 'models/gemini-embedding-2'
const dimension = 768
const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}`

interface GeminiEmbedding {
  values?: unknown[]
}

function readVector(embedding: GeminiEmbedding | undefined): number[] {
  const values = embedding?.values
  if (!Array.isArray(values) || values.length !== dimension ||
    !values.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
    !values.some((value) => value !== 0)) {
    throw new Error('Gemini returned an invalid embedding')
  }
  return values as number[]
}

export function createGeminiEmbeddings(apiKey: string, fetchRequest: typeof fetch = fetch) {
  function input(text: string) {
    return { model, content: { parts: [{ text }] }, outputDimensionality: dimension }
  }

  async function post(method: string, body: unknown, timeout: number, rateLimitRetries = 0) {
    const payload = JSON.stringify(body)
    for (let attempt = 0; ; attempt++) {
      const response = await fetchRequest(`${endpoint}:${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: payload,
        signal: AbortSignal.timeout(timeout),
      })
      if (response.ok) return await response.json()
      if (response.status !== 429 || attempt >= rateLimitRetries) {
        await response.body?.cancel()
        throw new Error(`Gemini embeddings HTTP ${response.status}`)
      }
      const retryAfter = response.headers.get('retry-after')
      const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Math.min(60, Number(retryAfter)) : 60
      await response.body?.cancel()
      console.info(`Gemini rate limit reached. Retrying the batch in ${seconds}s.`)
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    }
  }

  return {
    async embedQuestion(question: string) {
      const result = await post('embedContent', input(`task: question answering | query: ${question}`), 2500)
      return readVector(result.embedding)
    },
    async embedDocuments(documents: string[]) {
      const requests = documents.map(input)
      const result = await post('batchEmbedContents', { requests }, 45000, 3)
      if (!Array.isArray(result.embeddings) || result.embeddings.length !== documents.length) {
        throw new Error('Gemini returned the wrong number of embeddings')
      }
      return (result.embeddings as GeminiEmbedding[]).map(readVector)
    },
  }
}
