import type { DialogueMessage } from '../ports/message-repository.ts'

type KnowledgeRecord = { id: string; kind: string; title: string; body: string | null }

export interface KnowledgeMatches {
  paidServices: Array<KnowledgeRecord & {
    section: string | null
    audience: string | null
    unit: string | null
    price_label: string | null
    price_type: string | null
    amount: string | null
    max_amount: string | null
    effective_from: string | null
  }>
  researchDepartment: KnowledgeRecord[]
  clinicalDepartment: KnowledgeRecord[]
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
    const parts = searchQuestion.split(/(?<=\?)\s+|\r?\n+/u).map((part) => part.trim()).filter(Boolean)
    const queries = parts.length > 3 ? [...parts.slice(0, 2), parts.slice(2).join(' ')] : parts
    const results = await Promise.all([...new Set(queries)].map(search))
    const matches = {
      paidServices: uniqueRecords(results.flatMap((result) => result.paidServices)),
      researchDepartment: uniqueRecords(results.flatMap((result) => result.researchDepartment)),
      clinicalDepartment: uniqueRecords(results.flatMap((result) => result.clinicalDepartment)),
    }
    if (Object.values(matches).every((records) => records.length === 0)) return
    return await answer(question, matches, history)
  }
}

function uniqueRecords<T extends KnowledgeRecord>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()]
}
