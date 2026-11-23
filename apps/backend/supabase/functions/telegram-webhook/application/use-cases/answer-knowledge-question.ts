export interface KnowledgeMatches {
  tariffs: Array<Record<string, unknown>>
  chunks: Array<Record<string, unknown>>
}

export type AnswerKnowledgeQuestion = (question: string) => Promise<string | undefined>

interface KnowledgeAnswerOptions {
  search: (question: string) => Promise<KnowledgeMatches>
  answer: (question: string, matches: KnowledgeMatches) => Promise<string | undefined>
}

export function createAnswerKnowledgeQuestion({
  search,
  answer,
}: KnowledgeAnswerOptions): AnswerKnowledgeQuestion {
  return async (question) => {
    const matches = await search(question)
    if (matches.tariffs.length === 0 && matches.chunks.length === 0) return
    return await answer(question, matches)
  }
}
