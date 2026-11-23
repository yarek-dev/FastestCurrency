export interface TelegramUpdate {
  update_id?: number
  message?: {
    message_id?: number
    date?: number
    from?: TelegramUser
    chat?: {
      id?: number
      type?: string
    }
    text?: string
  }
}

export interface TelegramUser {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
}

export interface TelegramWebhookAction {
  method: "sendMessage"
  chat_id: number
  text: string
}
