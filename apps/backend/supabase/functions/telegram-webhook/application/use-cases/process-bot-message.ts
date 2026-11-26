import type { MessageRecord, MessageRepository } from '../ports/message-repository.ts'
import type { ReadDialogueHistory } from './answer-knowledge-question.ts'

interface ProcessBotMessageOptions {
  messageRepository: MessageRepository
  reply: (text: string | null, readHistory?: ReadDialogueHistory) => Promise<string>
  isManaged: (userId: string) => Promise<boolean>
}

export type ProcessBotMessage = (message: {
  incoming?: MessageRecord
  replyTo?: { text: string | null }
}) => Promise<string | undefined>

export function createProcessBotMessage({
  messageRepository, reply, isManaged,
}: ProcessBotMessageOptions): ProcessBotMessage {
  return async ({ incoming, replyTo }) => {
    const messageId = incoming ? await messageRepository.save(incoming) : undefined
    if (incoming && await isManaged(incoming.userTelegramId)) return
    if (!replyTo) return

    const readHistory = incoming && messageId
      ? () => messageRepository.readPrevious(incoming, messageId)
      : undefined
    const text = await reply(replyTo.text, readHistory)
    if (incoming) {
      // An operator may have connected while the bot was preparing its response.
      if (await isManaged(incoming.userTelegramId)) return
      await messageRepository.save({
        ...incoming, author: 'bot', body: text, createdAt: new Date().toISOString(),
      })
    }
    return text
  }
}
