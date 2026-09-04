export interface TelegramUpdate {
  update_id?: number
  message?: {
    chat?: {
      id?: number
      type?: string
    }
    text?: string
  }
  callback_query?: {
    id?: string
    data?: string
    message?: {
      date?: number
      chat?: {
        id?: number
        type?: string
      }
    }
  }
}

export interface TelegramInlineKeyboardButton {
  text: string
  callback_data: string
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export interface TelegramWebhookAction {
  method: 'sendMessage'
  chat_id: number
  text: string
  reply_markup?: TelegramInlineKeyboardMarkup
}
