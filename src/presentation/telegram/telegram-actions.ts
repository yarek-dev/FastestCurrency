import type {
  TelegramInlineKeyboardMarkup,
  TelegramWebhookAction,
} from './telegram-types.js'

export function createSendMessageAction(
  chatId: number,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
): TelegramWebhookAction {
  return {
    method: 'sendMessage',
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  }
}
