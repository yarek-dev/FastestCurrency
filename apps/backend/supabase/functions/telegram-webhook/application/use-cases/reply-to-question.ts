import type { AnswerKnowledgeQuestion } from './answer-knowledge-question.ts'

export function createReplyToQuestion(answerQuestion: AnswerKnowledgeQuestion) {
  return async (text: string | null): Promise<string> => {
    const question = text?.trim() ?? ''
    if (!question || question.startsWith('/')) {
      return 'Здравствуйте! Напишите вопрос о платных услугах, ценах или оплате.'
    }
    if (question.length > 1500) {
      return 'Пожалуйста, сократите вопрос до 1500 символов.'
    }
    try {
      const answer = await answerQuestion(question)
      return answer?.slice(0, 4000) || 'В справочнике не нашёл ответа. Уточните название услуги или свой вопрос.'
    } catch (error) {
      console.warn('Knowledge answer failed', error instanceof Error ? error.name : 'Unknown error')
      return 'Справочник временно недоступен. Попробуйте ещё раз позже.'
    }
  }
}
