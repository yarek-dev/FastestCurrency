import type { DialogueMessage } from '../ports/message-repository.ts'

export interface KnowledgeMatches {
  tariffs: Array<Record<string, unknown>>
  chunks: Array<Record<string, unknown>>
}

export type ReadDialogueHistory = () => Promise<DialogueMessage[]>
export type AnswerKnowledgeQuestion = (question: string, readHistory?: ReadDialogueHistory) => Promise<string | undefined>

interface KnowledgeAnswerOptions {
  search: (question: string) => Promise<KnowledgeMatches>
  answer: (question: string, matches: KnowledgeMatches, history: DialogueMessage[]) => Promise<string | undefined>
  fitHistory: (history: DialogueMessage[]) => Promise<DialogueMessage[]>
  rewriteQuestion: (question: string, history: DialogueMessage[]) => Promise<string | undefined>
}

export function createAnswerKnowledgeQuestion({
  search,
  answer,
  fitHistory,
  rewriteQuestion,
}: KnowledgeAnswerOptions): AnswerKnowledgeQuestion {
  return async (question, readHistory) => {
    let history: DialogueMessage[] = []
    let searchQuestion = question
    try {
      if (readHistory) history = await fitHistory(await readHistory())
      if (history.length) searchQuestion = await rewriteQuestion(question, history) || question
    } catch (error) {
      console.warn('Knowledge dialogue context failed', error instanceof Error ? error.name : 'Unknown error')
    }
    const matches = await search(searchQuestion)
    if (matches.tariffs.length === 0 && matches.chunks.length === 0) return
    return await answer(question, matches, history)
  }
}
