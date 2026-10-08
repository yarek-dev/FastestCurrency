import { afterEach, expect, test, vi } from 'vitest'
import { subscribeToChats } from '@frontend/src/modules/chats/api/chats-subscription'

const { handlers, channel, removeChannel, createClient } = vi.hoisted(() => {
  const handlers: Array<{ event: string; table: string; callback: (payload: unknown) => void }> = []
  const channel = {
    on: vi.fn((_type, filter, callback) => { handlers.push({ ...filter, callback }); return channel }),
    subscribe: vi.fn((_callback: (status: string) => void) => channel),
  }
  const removeChannel = vi.fn()
  const createClient = vi.fn(() => ({ channel: () => channel, removeChannel }))
  return { handlers, channel, removeChannel, createClient }
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); handlers.length = 0 })

test('forwards events and closes the channel without forwarding late events', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key')
  const callbacks = { onClient: vi.fn(), onMessage: vi.fn(), onStatus: vi.fn(), onError: vi.fn() }
  const cleanup = subscribeToChats(callbacks)
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
