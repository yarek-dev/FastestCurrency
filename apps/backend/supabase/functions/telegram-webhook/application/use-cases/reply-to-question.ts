import type { AnswerKnowledgeQuestion, ReadDialogueHistory } from './answer-knowledge-question.ts'

const clarification = 'Попробуйте, пожалуйста, сформулировать вопрос иначе. Например, уточните название услуги или отделения.'
const childCitizenshipQuestion = 'Подскажите, пожалуйста, какое гражданство у ребёнка?'
const managerOffer = 'Если хотите, чтобы вам помог менеджер, напишите «Позовите менеджера».'

export function createReplyToQuestion(answerQuestion: AnswerKnowledgeQuestion) {
  return async (text: string | null, readHistory?: ReadDialogueHistory): Promise<string> => {
    const question = text?.trim() ?? ''
    if (!question || question.startsWith('/')) {
      return 'Здравствуйте! Напишите вопрос о платных услугах, ценах или оплате.'
    }
    if (question.length > 1500) {
      return 'Пожалуйста, сократите вопрос до 1500 символов.'
    }
    if (/^позовите менеджера[.!]?$/iu.test(question)) {
      return 'Запрос на подключение менеджера сохранён в этом чате.'
    }

    let history: ReturnType<ReadDialogueHistory> | undefined
    const readHistoryOnce = readHistory ? () => history ??= readHistory() : undefined
    try {
      const answer = await answerQuestion(question, readHistoryOnce)
      if (!answer.needsClarification) return answer.text.slice(0, 4000)

      const clarificationQuestion = answer.needsChildCitizenship ? childCitizenshipQuestion : clarification
      const previous = (await readHistoryOnce?.().catch(() => []))?.at(-1)
      const repeated = previous?.role === 'bot' && [clarificationQuestion, managerOffer].some((message) =>
        previous.text === message || previous.text.endsWith(`\n\n${message}`)
      )
      const nextStep = repeated ? managerOffer : clarificationQuestion
      if (!answer.text) return nextStep
      return `${answer.text.slice(0, 4000 - nextStep.length - 2).trimEnd()}\n\n${nextStep}`
    } catch (error) {
      console.warn('Knowledge answer failed', error instanceof Error ? error.name : 'Unknown error')
      return 'Справочник временно недоступен. Попробуйте ещё раз позже.'
    }
  }
}
