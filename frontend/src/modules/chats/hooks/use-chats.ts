import { useEffect, useState } from 'react'
import { loadChats } from '../api/chats'
import type { Chat } from '../types/chats'

const pollingInterval = 15_000

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false

    async function refresh() {
      if (inFlight || controller.signal.aborted) return
      inFlight = true

      try {
        const nextChats = await loadChats(controller.signal)
        if (!controller.signal.aborted) {
          setChats(nextChats)
          setError(null)
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof TypeError
            ? 'Не удалось подключиться к перепискам. Проверьте соединение с сервером.'
            : cause instanceof Error ? cause.message : 'Не удалось загрузить переписки.')
        }
      } finally {
        inFlight = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), pollingInterval)

    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  return { chats, loading, error }
}
