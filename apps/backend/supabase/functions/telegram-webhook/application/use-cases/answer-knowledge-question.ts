import type { DialogueMessage } from '../ports/message-repository.ts'

type KnowledgeRecord = { id: string; kind: string; title: string; body: string | null }

type PaidServiceRecord = KnowledgeRecord & {
  section: string | null
  audience: string | null
  unit: string | null
  price_label: string | null
  price_type: string | null
  amount: string | null
  max_amount: string | null
  effective_from: string | null
}

export interface KnowledgeMatches {
  paidServices: PaidServiceRecord[]
  researchDepartment: KnowledgeRecord[]
  clinicalDepartment: KnowledgeRecord[]
}

const maternityGuidance = [
  'maternity_booking', 'maternity_contract', 'maternity_individual', 'maternity_consultation',
  'maternity_foreign_natural', 'maternity_foreign_cesarean',
] as const

export type PaidServiceGuidanceKey = typeof maternityGuidance[number] | 'ivf_booking' |
  'belarus_child_paid_services' | 'belarus_paid_diagnostics'

export type PaidServiceGuidance = Omit<PaidServiceRecord, 'id' | 'amount' | 'max_amount'> & {
  guidance_key: PaidServiceGuidanceKey
  amount: number | null
  max_amount: number | null
}

export type ReadDialogueHistory = () => Promise<DialogueMessage[]>
export type KnowledgeAnswer = { text: string; needsClarification: boolean; needsChildCitizenship?: boolean }
export type AnswerKnowledgeQuestion = (question: string, readHistory?: ReadDialogueHistory) => Promise<KnowledgeAnswer>

interface KnowledgeAnswerOptions {
  search: (question: string) => Promise<KnowledgeMatches>
  readPaidServiceGuidance: (keys: PaidServiceGuidanceKey[]) => Promise<PaidServiceGuidance[]>
  answer: (question: string, matches: KnowledgeMatches, history: DialogueMessage[], guidance: PaidServiceGuidance[]) => Promise<KnowledgeAnswer>
  fitHistory: (history: DialogueMessage[]) => Promise<DialogueMessage[]>
  rewriteQuestion: (question: string, history: DialogueMessage[]) => Promise<string | undefined>
}

const pediatricTerms = /дет(?:ск|и|ей|ям|ьми|ях)|реб[её]н|новорожд[её]н|педиатр|подростк/iu
const paidServiceTerms = /платн|тариф|стоимост|стоит|цен[ауые]|прайс/iu
const belarusCitizenship = /граждан[а-яё]*\s+(?:республик[аи]\s+)?(?:беларус[ьи]|рб)(?!\p{L})|белорусск[а-яё]*\s+гражданств/iu
const diagnosticTerms = /лучев[а-яё]*\s+диагностик|(?<!\p{L})(?:кт|мрт|узи)(?!\p{L})|рентген|анализ/iu
const maternityTerms = /(?<!\p{L})род(?:ы|ов|ам|ах|ами)(?!\p{L})|родоразрешен|родовспоможен|кесарев/iu
const ivfTerms = /(?<!\p{L})эко(?!\p{L})|экстракорпоральн[а-яё]*\s+оплодотворен/iu

export function createAnswerKnowledgeQuestion({
  search,
  readPaidServiceGuidance,
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
    const guidanceKeys = new Set<PaidServiceGuidanceKey>(queries.flatMap(guidanceForQuery))
    const [results, guidance] = await Promise.all([
      Promise.all([...new Set(queries)].map(async (query) => {
        const found = await search(query)
        if (!pediatricTerms.test(query) || !paidServiceTerms.test(query)) return found

        return {
          paidServices: found.paidServices.filter((record) => pediatricTerms.test(`${record.title} ${record.section ?? ''} ${record.body ?? ''}`)),
          researchDepartment: [],
          clinicalDepartment: found.clinicalDepartment.filter((record) => pediatricTerms.test(`${record.title} ${record.body ?? ''}`)),
        }
      })),
      guidanceKeys.size ? readPaidServiceGuidance([...guidanceKeys]) : [],
    ])
    const matches = {
      paidServices: uniqueRecords(results.flatMap((result) => result.paidServices)),
      researchDepartment: uniqueRecords(results.flatMap((result) => result.researchDepartment)),
      clinicalDepartment: uniqueRecords(results.flatMap((result) => result.clinicalDepartment)),
    }
    if (!guidanceKeys.has('belarus_child_paid_services') && !guidance.length &&
      Object.values(matches).every((records) => records.length === 0)) {
      return { text: '', needsClarification: true }
    }
    return await answer(question, matches, history, guidance)
  }
}

function guidanceForQuery(query: string): PaidServiceGuidanceKey[] {
  const keys: PaidServiceGuidanceKey[] = []
  const asksAboutPaidServices = paidServiceTerms.test(query) || belarusCitizenship.test(query)
  if (maternityTerms.test(query)) keys.push(...maternityGuidance)
  if (ivfTerms.test(query)) keys.push('ivf_booking')
  if (asksAboutPaidServices && pediatricTerms.test(query)) keys.push('belarus_child_paid_services')
  if (asksAboutPaidServices && diagnosticTerms.test(query)) keys.push('belarus_paid_diagnostics')
  return keys
}

function uniqueRecords<T extends KnowledgeRecord>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()]
}
