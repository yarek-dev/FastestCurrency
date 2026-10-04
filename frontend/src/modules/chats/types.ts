export interface Message {
  id: string
  author: 'client' | 'bot'
  text: string
  time: string
}

export interface Chat {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  unread: number
  messages: Message[]
}
