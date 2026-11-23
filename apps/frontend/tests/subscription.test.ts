import { waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { subscribeToChats } from '@frontend/src/modules/chats/api/chats-subscription'

const { handlers, channel, openChannel, removeChannel, createClient, setAuth } = vi.hoisted(() => {
  const handlers: Array<{ event: string; table: string; callback: (payload: unknown) => void }> = []
  const channel = {
    on: vi.fn((_type, filter, callback) => { handlers.push({ ...filter, callback }); return channel }),
    subscribe: vi.fn((_callback: (status: string) => void) => channel),
  }
  const removeChannel = vi.fn()
  const openChannel = vi.fn((_topic: string) => channel)
  const setAuth = vi.fn(async (_token: string) => {})
  const createClient = vi.fn(() => ({
    channel: openChannel, removeChannel, realtime: { setAuth },
    auth: { getSession: async () => ({ data: { session: { access_token: 'admin-token' } } }) },
  }))
  return { handlers, channel, openChannel, removeChannel, createClient, setAuth }
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); handlers.length = 0 })

test('authenticates before subscribing, forwards events and ignores late events after cleanup', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key')
  const callbacks = { onClient: vi.fn(), onMessage: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
  const cleanup = subscribeToChats(callbacks)
  await waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce())
  expect(setAuth).toHaveBeenCalledWith('admin-token')
  expect(setAuth.mock.invocationCallOrder[0]).toBeLessThan(channel.subscribe.mock.invocationCallOrder[0])
  expect(handlers.map(({ table, event }) => `${table}:${event}`)).toEqual(['clients:INSERT', 'clients:UPDATE', 'messages:INSERT'])
  handlers[2].callback({ new: { id: '1' } })
  channel.subscribe.mock.calls[0][0]('SUBSCRIBED')
  expect(callbacks.onMessage).toHaveBeenCalledOnce()
  expect(callbacks.onStatus).toHaveBeenCalledWith('SUBSCRIBED')
  cleanup()
  expect(removeChannel).toHaveBeenCalledWith(channel)
  handlers[2].callback({ new: { id: '2' } })
  channel.subscribe.mock.calls[0][0]('CLOSED')
  expect(callbacks.onMessage).toHaveBeenCalledOnce()
  expect(callbacks.onStatus).toHaveBeenCalledOnce()
})

test('returns a cleanup function when configuration is absent', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  const onError = vi.fn()
  const cleanup = subscribeToChats({ onError, onClient: vi.fn(), onMessage: vi.fn(), onStatus: vi.fn() })
  expect(onError).toHaveBeenCalledOnce()
  expect(createClient).not.toHaveBeenCalled()
  expect(() => cleanup()).not.toThrow()
})

test('opens a different topic when remounting before asynchronous cleanup completes', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key')
  const callbacks = { onClient: vi.fn(), onMessage: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
  const closeFirst = subscribeToChats(callbacks)
  await waitFor(() => expect(openChannel).toHaveBeenCalledTimes(1))
  closeFirst()
  const closeSecond = subscribeToChats(callbacks)
  await waitFor(() => expect(openChannel).toHaveBeenCalledTimes(2))
  expect(openChannel.mock.calls[0][0]).not.toBe(openChannel.mock.calls[1][0])
  closeSecond()
})

test('does not open a channel when the view unmounts before authentication completes', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key')
  const callbacks = { onClient: vi.fn(), onMessage: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
  subscribeToChats(callbacks)()
  await Promise.resolve()
  expect(openChannel).not.toHaveBeenCalled()
  expect(callbacks.onError).not.toHaveBeenCalled()
})
