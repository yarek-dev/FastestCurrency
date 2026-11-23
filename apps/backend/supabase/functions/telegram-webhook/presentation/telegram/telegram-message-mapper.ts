import type { MessageRecord } from '../../application/ports/message-repository.ts'
import type {
  TelegramUpdate,
  TelegramUser,
  TelegramWebhookAction,
} from './telegram-types.ts'

interface TelegramConversation {
  userTelegramId: string
  firstName: string | null
  lastName: string | null
  author: string
}

function toConversation(
  user: TelegramUser | undefined,
  chatId: number | undefined,
): TelegramConversation | undefined {
  const userId = user?.id ?? chatId

  if (typeof userId !== 'number') {
    return
  }

  const firstName = user?.first_name ?? null

  return {
    userTelegramId: String(userId),
    firstName,
    lastName: user?.last_name ?? null,
    author: user?.username ?? firstName ?? String(userId),
  }
}

function getConversation(
  update: TelegramUpdate,
): TelegramConversation | undefined {
  const message = update.message

  if (message?.chat?.type === 'private') {
    return toConversation(message.from, message.chat.id)
  }

  const callbackQuery = update.callback_query

  if (callbackQuery?.message?.chat?.type === 'private') {
    return toConversation(
      callbackQuery.from,
      callbackQuery.message.chat.id,
    )
  }
}

function toIsoDate(unixSeconds: number | undefined): string {
  if (
    typeof unixSeconds === 'number' &&
    Number.isFinite(unixSeconds) &&
    unixSeconds > 0
  ) {
    return new Date(unixSeconds * 1_000).toISOString()
  }

  return new Date().toISOString()
}

export function toIncomingTelegramMessage(
  update: TelegramUpdate,
): MessageRecord | undefined {
  const message = update.message
  const conversation = getConversation(update)

  if (!message || !conversation) {
    return
  }

  return {
    ...conversation,
    body: typeof message.text === 'string' ? message.text : null,
    createdAt: toIsoDate(message.date),
  }
}

export function toOutgoingTelegramMessage(
  update: TelegramUpdate,
  action: TelegramWebhookAction,
): MessageRecord | undefined {
  const conversation = getConversation(update)

  if (!conversation) {
    return
  }

  return {
    ...conversation,
    author: 'bot',
    body: action.text,
    createdAt: new Date().toISOString(),
  }
}
