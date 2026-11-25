import type { ProcessBotMessage } from '../../application/use-cases/process-bot-message.ts'
import { createSendMessageAction } from './telegram-actions.ts'
import { toIncomingTelegramMessage } from './telegram-message-mapper.ts'
import type { TelegramUpdate } from './telegram-types.ts'

export function createTelegramUpdateAdapter(processMessage: ProcessBotMessage) {
  return async (update: TelegramUpdate) => {
    const message = update.message
    if (message?.chat?.type !== 'private') return

    const chatId = message.chat.id
    const text = await processMessage({
      incoming: toIncomingTelegramMessage(update),
      replyTo: typeof chatId === 'number'
        ? { text: typeof message.text === 'string' ? message.text : null }
        : undefined,
    })
    if (typeof chatId === 'number' && text !== undefined) return createSendMessageAction(chatId, text)
  }
}
