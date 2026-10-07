import { act, renderHook, waitFor } from '@testing-library/react'
import { SWRConfig, useSWRConfig, type SWRConfiguration } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'
import { useMessages } from '@frontend/src/modules/chats/hooks/use-messages'
import { useChats } from '@frontend/src/modules/chats/hooks/use-chats'
import { swrOptions } from '@frontend/src/modules/chats/api/swr-config'
import { loadClients, loadMessagePage, liveMessagesKey, mergeMessages, messageCursor, type MessageRecord } from '@frontend/src/modules/chats/api/chats'
import { subscribeToChats } from '@frontend/src/modules/chats/api/chats-subscription'

vi.mock('@frontend/src/modules/chats/api/chats', async importOriginal => ({
  ...await importOriginal<typeof import('@frontend/src/modules/chats/api/chats')>(),
  loadClients: vi.fn(), loadMessagePage: vi.fn(),
}))
vi.mock('@frontend/src/modules/chats/api/chats-subscription', () => ({ subscribeToChats: vi.fn() }))

function message(id: number, client = '1'): MessageRecord {
  return { id: String(id), client_id: client, created_at: '2026-10-05T10:00:00.123456Z', author: 'client', body: `Message ${id}` }
}
function wrapper(options: SWRConfiguration = {}) {
  const cache = new Map()
  return function Wrapper({ children }: PropsWithChildren) {
    return <SWRConfig value={{ ...swrOptions, provider: () => cache, dedupingInterval: 0, errorRetryCount: 0, ...options }}>{children}</SWRConfig>
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.mocked(loadClients).mockReset().mockResolvedValue([
    { id: '1', first_name: 'Анна', last_name: null, user_telegram_id: '123', last_message_at: '2026-10-05T10:00:00Z', last_message: message(100) },
    { id: '2', first_name: 'Борис', last_name: null, user_telegram_id: '456', last_message_at: '2026-10-05T09:00:00Z', last_message: message(200, '2') },
  ])
  vi.mocked(loadMessagePage).mockReset().mockImplementation(async (client, cursor, direction) => {
    if (direction === 'after') return { items: [], nextCursor: null }
    const top = client === '1' ? 100 : 200
    return cursor === null
      ? { items: Array.from({ length: 20 }, (_, index) => message(top - index, client)), nextCursor: 'older' }
      : { items: Array.from({ length: 20 }, (_, index) => message(top - 20 - index, client)), nextCursor: null }
  })
  vi.mocked(subscribeToChats).mockReset().mockReturnValue(vi.fn())
})

describe('cursor history with SWR', () => {
  it('stops after three automatic retries', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(loadMessagePage).mockRejectedValue(new Error('Offline'))
      const { result, unmount } = renderHook(() => useMessages('1', 0, false), {
        wrapper: wrapper({ errorRetryCount: 3, errorRetryInterval: 10 }),
      })
      await act(() => vi.advanceTimersByTimeAsync(20_000))
      expect(loadMessagePage).toHaveBeenCalledTimes(4)
      expect(result.current.error).toBeTruthy()
      await act(() => vi.advanceTimersByTimeAsync(20_000))
      expect(loadMessagePage).toHaveBeenCalledTimes(4)
      unmount()
    } finally { vi.useRealTimers() }
  })
  it('loads 20, uses the server cursor, and prevents simultaneous older-page requests', async () => {
    const older = deferred<Awaited<ReturnType<typeof loadMessagePage>>>()
    vi.mocked(loadMessagePage).mockImplementation(async (_id, cursor) => cursor === null
      ? { items: Array.from({ length: 20 }, (_, index) => message(100 - index)), nextCursor: 'older' }
      : older.promise)
    const { result } = renderHook(() => useMessages('1', 0, false), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.messages).toHaveLength(20))
    act(() => { void result.current.loadMore(); void result.current.loadMore() })
    await waitFor(() => expect(loadMessagePage).toHaveBeenCalledTimes(2))
    expect(loadMessagePage).toHaveBeenLastCalledWith('1', 'older')
    await act(async () => older.resolve({ items: Array.from({ length: 20 }, (_, index) => message(80 - index)), nextCursor: null }))
    await waitFor(() => expect(result.current.messages).toHaveLength(40))
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps pages per client and does not refetch when returning to a loaded dialog', async () => {
    const { result, rerender } = renderHook(({ id }) => useMessages(id, 0, false), {
      wrapper: wrapper(), initialProps: { id: '1' },
    })
    await waitFor(() => expect(result.current.messages).toHaveLength(20))
    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.messages).toHaveLength(40))
    rerender({ id: '2' })
    await waitFor(() => expect(result.current.messages.at(-1)?.id).toBe('200'))
    const calls = vi.mocked(loadMessagePage).mock.calls.length
    rerender({ id: '1' })
    await waitFor(() => expect(result.current.messages).toHaveLength(40))
    expect(loadMessagePage).toHaveBeenCalledTimes(calls)
  })

  it('retains realtime messages during a pending page load and removes duplicate IDs', async () => {
    const older = deferred<Awaited<ReturnType<typeof loadMessagePage>>>()
    vi.mocked(loadMessagePage).mockImplementation(async (_id, cursor) => cursor === null
      ? { items: Array.from({ length: 20 }, (_, index) => message(100 - index)), nextCursor: 'older' }
      : older.promise)
    const { result } = renderHook(() => {
      const { mutate } = useSWRConfig()
      return { ...useMessages('1', 0, false), insert: (row: MessageRecord) => mutate(liveMessagesKey('1'),
        (current: MessageRecord[] = []) => mergeMessages(current, [row]), { revalidate: false }) }
    }, { wrapper: wrapper() })
    await waitFor(() => expect(result.current.messages).toHaveLength(20))
    act(() => { void result.current.loadMore() })
    await act(async () => { await result.current.insert(message(101)); await result.current.insert(message(101)) })
    await act(async () => older.resolve({ items: Array.from({ length: 20 }, (_, index) => message(80 - index)), nextCursor: null }))
    await waitFor(() => expect(result.current.messages).toHaveLength(41))
    expect(result.current.messages.at(-1)?.id).toBe('101')
  })

  it('keeps existing history on a page error and retries only the missing page', async () => {
    const { result } = renderHook(() => useMessages('1', 0, false), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.messages).toHaveLength(20))
    vi.mocked(loadMessagePage).mockRejectedValueOnce(new Error('Offline'))
    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.messages).toHaveLength(20)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.messages).toHaveLength(40))
    expect(vi.mocked(loadMessagePage).mock.calls.filter(([, cursor]) => cursor === null)).toHaveLength(1)
  })

  it('does not show a previous client while its pending response completes', async () => {
    const first = deferred<Awaited<ReturnType<typeof loadMessagePage>>>()
    vi.mocked(loadMessagePage).mockImplementation(async id => id === '1' ? first.promise
      : { items: [message(200, '2')], nextCursor: null })
    const { result, rerender } = renderHook(({ id }) => useMessages(id, 0, false), {
      wrapper: wrapper(), initialProps: { id: '1' },
    })
    rerender({ id: '2' })
    await waitFor(() => expect(result.current.messages.at(-1)?.id).toBe('200'))
    await act(async () => first.resolve({ items: [message(100)], nextCursor: null }))
    expect(result.current.messages.map(row => row.id)).toEqual(['200'])
  })

  it('does not revalidate on window focus', async () => {
    const { result } = renderHook(() => useMessages('1', 0, false), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.messages).toHaveLength(20))
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(loadMessagePage).toHaveBeenCalledTimes(1)
  })
})

describe('realtime and reconnect', () => {
  it('preserves buffered client events and the newest preview while clients are loading', async () => {
    const pending = deferred<Awaited<ReturnType<typeof loadClients>>>()
    vi.mocked(loadClients).mockReturnValueOnce(pending.promise)
    const { result } = renderHook(() => useChats('1'), { wrapper: wrapper() })
    const callbacks = vi.mocked(subscribeToChats).mock.calls[0][0]
    act(() => {
      callbacks.onClient({ id: '1', first_name: 'Новое имя', last_name: null,
        user_telegram_id: '123', last_message_at: message(102).created_at })
      callbacks.onMessage(message(102))
      callbacks.onMessage(message(101))
    })
    expect(result.current.chats).toHaveLength(0)
    await act(async () => pending.resolve([
      { id: '1', first_name: 'Старое имя', last_name: null, user_telegram_id: '123',
        last_message_at: '2026-10-05T10:00:00Z', last_message: message(100) },
    ]))
    await waitFor(() => expect(result.current.selectedChat?.messages).toHaveLength(22))
    expect(result.current.chats[0].name).toBe('Новое имя')
    expect(result.current.chats[0].lastMessage?.id).toBe('102')
    expect(result.current.chats[0].lastMessage?.createdAt).toBe(message(102).created_at)
  })

  it('keeps preview updates from several events in the same render', async () => {
    const { result } = renderHook(() => useChats('1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.chats).toHaveLength(2))
    const callbacks = vi.mocked(subscribeToChats).mock.calls[0][0]
    act(() => {
      callbacks.onMessage(message(101))
      callbacks.onMessage(message(201, '2'))
    })
    await waitFor(() => expect(result.current.chats.find(chat => chat.id === '1')?.lastMessage?.id).toBe('101'))
    expect(result.current.chats.find(chat => chat.id === '2')?.lastMessage?.id).toBe('201')
  })
  it('restores more than 20 missed messages without replacing older loaded pages', async () => {
    const { result } = renderHook(() => useChats('1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.history.messages).toHaveLength(20))
    const callbacks = vi.mocked(subscribeToChats).mock.calls[0][0]
    act(() => callbacks.onStatus('SUBSCRIBED'))
    await waitFor(() => expect(result.current.history.syncing).toBe(false))
    await act(() => result.current.history.loadMore())
    await waitFor(() => expect(result.current.history.messages).toHaveLength(40))
    act(() => callbacks.onStatus('CHANNEL_ERROR'))
    const missed = Array.from({ length: 45 }, (_, index) => message(101 + index))
    vi.mocked(loadMessagePage).mockImplementation(async (_id, cursor, direction) => {
      if (direction !== 'after') throw new Error('Older history should remain cached')
      const decoded = JSON.parse(atob(cursor!.replaceAll('-', '+').replaceAll('_', '/')))
      const remaining = missed.filter(row => BigInt(row.id) > BigInt(decoded.id))
      const items = remaining.slice(0, 20)
      return { items, nextCursor: remaining.length > 20 ? messageCursor(items.at(-1)!) : null }
    })
    act(() => callbacks.onStatus('SUBSCRIBED'))
    await waitFor(() => expect(result.current.history.messages).toHaveLength(85))
    expect(result.current.history.messages[0].id).toBe('61')
    expect(result.current.history.messages.at(-1)?.id).toBe('145')
  })

  it('updates client previews and caches a realtime message without reloading history', async () => {
    const { result, unmount } = renderHook(() => useChats('1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.selectedChat?.messages).toHaveLength(20))
    const callbacks = vi.mocked(subscribeToChats).mock.calls[0][0]
    const calls = vi.mocked(loadMessagePage).mock.calls.length
    act(() => callbacks.onMessage(message(101)))
    await waitFor(() => expect(result.current.selectedChat?.messages.at(-1)?.id).toBe('101'))
    await waitFor(() => expect(result.current.chats[0].lastMessage?.id).toBe('101'))
    expect(loadMessagePage).toHaveBeenCalledTimes(calls)
    const cleanup = vi.mocked(subscribeToChats).mock.results[0].value
    unmount()
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
