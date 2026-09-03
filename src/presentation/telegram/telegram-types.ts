export interface TelegramUpdate {
  update_id?: number
  message?: {
    chat?: {
      id?: number
      type?: string
    }
    text?: string
  }
}

export interface TelegramWebhookAction {
  method: 'sendMessage'
  chat_id: number
  text: string
}
