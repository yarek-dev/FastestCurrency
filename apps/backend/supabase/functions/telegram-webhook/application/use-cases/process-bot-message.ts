import type { MessageRecord, MessageRepository } from '../ports/message-repository.ts'

interface ProcessBotMessageOptions {
  messageRepository: MessageRepository
  reply: (text: string | null) => Promise<string>
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
    if (incoming) await messageRepository.save(incoming)
    if (incoming && await isManaged(incoming.userTelegramId)) return
    if (!replyTo) return

    const text = await reply(replyTo.text)
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
