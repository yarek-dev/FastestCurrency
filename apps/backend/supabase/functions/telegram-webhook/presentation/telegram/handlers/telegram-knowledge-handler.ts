import type { AnswerKnowledgeQuestion } from '../../../application/use-cases/answer-knowledge-question.ts'
import { createSendMessageAction } from '../telegram-actions.ts'
import type { TelegramUpdate, TelegramWebhookAction } from '../telegram-types.ts'

export function createTelegramKnowledgeHandler({
  answerQuestion,
}: {
  answerQuestion: AnswerKnowledgeQuestion
}) {
  return async (update: TelegramUpdate): Promise<TelegramWebhookAction | undefined> => {
    const message = update.message
    if (message?.chat?.type !== 'private' || typeof message.chat.id !== 'number') return

    const chatId = message.chat.id
    const question = typeof message.text === 'string' ? message.text.trim() : ''
    if (!question || question.startsWith('/')) {
      return createSendMessageAction(chatId, 'Здравствуйте! Напишите вопрос о платных услугах, ценах или оплате.')
    }
    if (question.length > 1500) {
      return createSendMessageAction(chatId, 'Пожалуйста, сократите вопрос до 1500 символов.')
    }

    try {
      const answer = await answerQuestion(question)
      return createSendMessageAction(
        chatId,
        answer?.slice(0, 4000) || 'В справочнике не нашёл ответа. Уточните название услуги или свой вопрос.',
      )
    } catch (error) {
      console.warn('Knowledge answer failed', error instanceof Error ? error.name : 'Unknown error')
      return createSendMessageAction(chatId, 'Справочник временно недоступен. Попробуйте ещё раз позже.')
    }
  }
}
