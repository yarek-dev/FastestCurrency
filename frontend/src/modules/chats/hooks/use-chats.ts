import { useEffect, useState } from 'react'
import { subscribeToChats } from '../api/chats-subscription'
import type { Chat, ChatsConnection } from '../types/chats'

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ChatsConnection>('connecting')

  useEffect(() => {
    return subscribeToChats({
      onChats: setChats,
      onLoading: setLoading,
      onError: setError,
      onConnection: setConnection,
    })
  }, [])

  return { chats, loading, error, connection }
}
