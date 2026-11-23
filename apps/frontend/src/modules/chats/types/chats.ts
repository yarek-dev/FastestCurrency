export type ChatsConnection = 'connecting' | 'syncing' | 'live' | 'disconnected'

export interface Message {
  id: string
  author: 'client' | 'bot' | 'manager' | 'notice'
  text: string
  time: string
  createdAt: string
}

export interface Chat {
  id: string
  name: string
  telegramId: string
  managerUserId: string | null
  initials: string
  color: string
  messages: Message[]
  lastMessage?: Message
}
