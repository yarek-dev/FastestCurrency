import type { TelegramWebhookAction } from "./telegram-types.ts"

export function createSendMessageAction(
  chatId: number,
  text: string,
): TelegramWebhookAction {
  return {
    method: "sendMessage",
    chat_id: chatId,
    text,
  }
}
