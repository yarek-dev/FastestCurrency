export interface KnowledgeMatches {
  tariffs: Array<Record<string, unknown>>
  chunks: Array<Record<string, unknown>>
}

export type AnswerKnowledgeQuestion = (question: string) => Promise<string | undefined>

interface KnowledgeAnswerOptions {
  selectQuery: (question: string) => Promise<{
    query: string
    answer: (matches: KnowledgeMatches) => Promise<string | undefined>
  }>
  search: (query: string) => Promise<KnowledgeMatches>
}

export function createAnswerKnowledgeQuestion({
  selectQuery,
  search,
}: KnowledgeAnswerOptions): AnswerKnowledgeQuestion {
  return async (question) => {
    const lookup = await selectQuery(question)
    const matches = await search(lookup.query)
    if (matches.tariffs.length === 0 && matches.chunks.length === 0) return
    return await lookup.answer(matches)
  }
}
