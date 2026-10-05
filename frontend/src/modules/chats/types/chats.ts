export interface Message {
  id: string
  author: 'client' | 'bot'
  text: string
  time: string
  createdAt: string
}

export interface Chat {
  id: string
  name: string
  telegramId: string
  initials: string
  color: string
  messages: Message[]
}
