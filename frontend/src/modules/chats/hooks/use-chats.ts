import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { subscribeToChats } from '../api/chats-subscription'
import {
  clientsKey, compareMessages, liveMessagesKey, loadClients, mergeMessages, toChats,
  type ClientRecord, type MessageRecord,
} from '../api/chats'
import { useMessages } from './use-messages'
import type { ChatsConnection } from '../types/chats'

export function useChats(selectedId: string | null = null) {
  const { mutate } = useSWRConfig()
  const clients = useSWR<ClientRecord[]>(clientsKey, loadClients)
  const [connection, setConnection] = useState<ChatsConnection>('connecting')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const pendingClients = useRef(new Map<string, ClientRecord>())
  const pendingMessages = useRef(new Map<string, MessageRecord>())
  const clientState = useRef({ data: clients.data, validating: clients.isValidating })
  clientState.current = { data: clients.data, validating: clients.isValidating }

  const flushClients = useCallback(() => {
    const { data, validating } = clientState.current
    if (!data || validating || (!pendingClients.current.size && !pendingMessages.current.size)) return
    void mutate(clientsKey, (current: ClientRecord[] = data) => {
      const updated = new Map(current.map(client => [String(client.id), client]))
      for (const [id, client] of pendingClients.current) {
        const previous = updated.get(id)
        updated.set(id, { ...previous, ...client, last_message: previous?.last_message,
          last_message_at: previous && Date.parse(previous.last_message_at) > Date.parse(client.last_message_at)
            ? previous.last_message_at : client.last_message_at })
      }
      for (const [id, message] of pendingMessages.current) {
        const client = updated.get(id)
        if (client && (!client.last_message || compareMessages(message, client.last_message) > 0)) {
          updated.set(id, { ...client, last_message: message,
            last_message_at: Date.parse(message.created_at) > Date.parse(client.last_message_at)
              ? message.created_at : client.last_message_at })
        }
      }
      pendingClients.current.clear()
      pendingMessages.current.clear()
      return [...updated.values()]
    }, { revalidate: false })
  }, [mutate])

  useEffect(flushClients, [clients.data, clients.isValidating, flushClients])
  useEffect(() => subscribeToChats({
    onClient: client => {
      pendingClients.current.set(String(client.id), client)
      flushClients()
    },
    onMessage: message => {
      const id = String(message.client_id)
      const previous = pendingMessages.current.get(id)
      if (!previous || compareMessages(message, previous) > 0) pendingMessages.current.set(id, message)
      void mutate(liveMessagesKey(id),
        (current: MessageRecord[] = []) => mergeMessages(current, [message]), { revalidate: false })
      flushClients()
    },
    onStatus: status => {
      if (status === 'SUBSCRIBED') {
        setConnection('live')
        setConnectionError(null)
        setGeneration(value => value + 1)
        void mutate(clientsKey)
      } else {
        setConnection('disconnected')
        setConnectionError('Соединение прервано. После подключения восстановим историю.')
      }
    },
    onError: error => {
      setConnection('disconnected')
      setConnectionError(error)
    },
  }), [mutate, flushClients])

  const chats = useMemo(() => toChats({ clients: clients.data ?? [], messages: [] }), [clients.data])
  const selected = chats.find(chat => chat.id === selectedId) ?? chats[0]
  const history = useMessages(selected?.id, generation, connection === 'live')
  const selectedChat = selected ? { ...selected, messages: history.messages } : undefined
  const error = clients.error?.message ?? connectionError
  return {
    chats, selectedChat, history, loading: clients.isLoading, error,
    connection: connection === 'live' && history.syncing ? 'syncing' as const : connection,
    retryClients: () => void clients.mutate(),
  }
}
