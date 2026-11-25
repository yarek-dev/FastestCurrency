export interface HistoryPageQuery {
  clientId: string
  createdAt: string | null
  id: string | null
  direction: 'before' | 'after'
}

interface MessageRow {
  id: string
  client_id: string
  created_at: string
  author: string | null
  body: string | null
}

export interface InboxReader {
  listClients(): Promise<unknown>
  readHistory(query: HistoryPageQuery): Promise<MessageRow[]>
}
