export interface MessageRecord {
  userTelegramId: string
  firstName: string | null
  lastName: string | null
  author: string
  body: string | null
  createdAt: string
}

export interface MessageRepository {
  save(message: MessageRecord): Promise<void>
}
