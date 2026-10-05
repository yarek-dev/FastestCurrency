import type { Chat, Message } from '../types/chats'

interface ClientRecord {
  id: number | string
  user_telegram_id: string
  first_name: string | null
  last_name: string | null
}

interface MessageRecord {
  id: number | string
  client_id: number | string
  created_at: string
  author: string | null
  body: string | null
}

const avatarColors = ['#e7eafa', '#e3eeea', '#f5e7eb', '#f2ecde', '#e3edf7', '#ede7f5']
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

async function request<T>(endpoint: string, signal: AbortSignal): Promise<T[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')

  if (!supabaseUrl) {
    throw new Error('Не настроено подключение к перепискам.')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    signal,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${endpoint === 'clients' ? 'клиентов' : 'сообщения'} (HTTP ${response.status}).`)
  }

  const records: unknown = await response.json()
  if (!Array.isArray(records)) {
    throw new Error('Сервер вернул неожиданный формат данных.')
  }

  return records as T[]
}

export async function loadChats(signal: AbortSignal): Promise<Chat[]> {
  const [clients, messages] = await Promise.all([
    request<ClientRecord>('clients', signal),
    request<MessageRecord>('messages', signal),
  ])

  const messagesByClient = new Map<string, Message[]>()
  const orderedMessages = [...messages].sort((left, right) =>
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    || String(left.id).localeCompare(String(right.id), undefined, { numeric: true }),
  )

  for (const message of orderedMessages) {
    const clientId = String(message.client_id)
    const conversation = messagesByClient.get(clientId) ?? []
    conversation.push({
      id: String(message.id),
      author: message.author === 'bot' ? 'bot' : 'client',
      text: message.body ?? 'Сообщение без текста',
      time: timeFormatter.format(new Date(message.created_at)),
      createdAt: message.created_at,
    })
    messagesByClient.set(clientId, conversation)
  }

  return clients.map(client => {
    const id = String(client.id)
    const fullName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim()
    const name = fullName || `Клиент ${client.user_telegram_id}`
    const colorIndex = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarColors.length

    return {
      id,
      name,
      telegramId: client.user_telegram_id,
      initials: fullName
        ? fullName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('ru')
        : 'К',
      color: avatarColors[colorIndex],
      messages: messagesByClient.get(id) ?? [],
    }
  })
}
