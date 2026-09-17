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
  callback_query?: {
    id?: string
    data?: string
    from?: TelegramUser
    message?: {
      date?: number
      chat?: {
        id?: number
        type?: string
      }
    }
  }
}

export interface TelegramUser {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
}

export interface TelegramInlineKeyboardButton {
  text: string
  callback_data: string
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export interface TelegramWebhookAction {
  method: "sendMessage"
  chat_id: number
  text: string
  reply_markup?: TelegramInlineKeyboardMarkup
}
