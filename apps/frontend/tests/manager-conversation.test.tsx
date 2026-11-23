import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadClients, loadMessagePage, runManagerAction } from '@frontend/src/modules/chats/api/chats'
import type { ClientRecord, MessageRecord } from '@frontend/src/modules/chats/api/chats'
import { subscribeToChats } from '@frontend/src/modules/chats/api/chats-subscription'
import { swrOptions } from '@frontend/src/modules/chats/api/swr-config'
import { ChatsPage } from '@frontend/src/modules/chats'

vi.mock('@frontend/src/components/theme-switch/theme-switch', () => ({ ThemeSwitch: () => null }))
vi.mock('@frontend/src/modules/chats/api/chats', async importOriginal => ({
  ...await importOriginal<typeof import('@frontend/src/modules/chats/api/chats')>(),
  loadClients: vi.fn(), loadMessagePage: vi.fn(), runManagerAction: vi.fn(),
}))
vi.mock('@frontend/src/modules/chats/api/chats-subscription', () => ({ subscribeToChats: vi.fn() }))

const adminUserId = 'my-admin'
const client: ClientRecord = {
  id: '1', user_telegram_id: '123', first_name: 'Анна', last_name: null,
  last_message_at: '2026-11-23T13:00:00Z', manager_user_id: null,
}

function outgoing(id: string, body: string, manager_kind: 'notice' | 'reply'): MessageRecord {
  return { id, client_id: '1', author: 'manager', body, manager_kind, created_at: '2026-11-23T13:01:00Z' }
}

function renderPage() {
  render(
    <SWRConfig value={{ ...swrOptions, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ChatsPage adminUserId={adminUserId} />
    </SWRConfig>,
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.mocked(loadClients).mockReset().mockResolvedValue([client])
  vi.mocked(loadMessagePage).mockReset().mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(runManagerAction).mockReset()
  vi.mocked(subscribeToChats).mockReset().mockReturnValue(vi.fn())
})

afterEach(() => vi.unstubAllGlobals())

it('connects, sends a labeled reply once across HTTP and Realtime, and finishes the dialog', async () => {
  const joined = outgoing('1', 'Менеджер подключился', 'notice')
  const reply = outgoing('2', 'Добрый день!', 'reply')
  const finished = outgoing('3', 'Менеджер завершил диалог', 'notice')
  vi.mocked(runManagerAction)
    .mockImplementationOnce(async () => {
      vi.mocked(loadClients).mockResolvedValue([{ ...client, manager_user_id: adminUserId }])
      return { ok: true, message: joined }
    })
    .mockResolvedValueOnce({ ok: true, message: reply })
    .mockImplementationOnce(async () => {
      vi.mocked(loadClients).mockResolvedValue([client])
      return { ok: true, message: finished }
    })

  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Подключиться' }))
  const chat = within(screen.getByRole('region', { name: 'Переписка с клиентом Анна' }))
  const draft = await chat.findByRole('textbox', { name: 'Ответ менеджера' })
  expect(await chat.findByText('Менеджер подключился')).toBeVisible()
  fireEvent.change(draft, { target: { value: '  Добрый день!  ' } })
  const send = chat.getByRole('button', { name: 'Отправить' })
  fireEvent.click(send)
  expect(send).toBeDisabled()
  await act(async () => vi.mocked(subscribeToChats).mock.calls[0][0].onMessage(reply))
  expect(await chat.findByText('Менеджер')).toBeVisible()
  expect(chat.getAllByText('Добрый день!')).toHaveLength(1)
  await waitFor(() => expect(draft).toHaveValue(''))
  fireEvent.click(chat.getByRole('button', { name: 'Завершить диалог' }))
  expect(await chat.findByText('Менеджер завершил диалог')).toBeVisible()
  expect(await chat.findByText('Бот отвечает автоматически')).toBeVisible()
  expect(chat.queryByRole('textbox')).not.toBeInTheDocument()
  expect(runManagerAction).toHaveBeenNthCalledWith(1, '1', { action: 'connect' })
  expect(runManagerAction).toHaveBeenNthCalledWith(2, '1', { action: 'send', text: 'Добрый день!' })
  expect(runManagerAction).toHaveBeenNthCalledWith(3, '1', { action: 'finish' })
})

it('keeps the draft on failure and hides controls when another manager takes over', async () => {
  vi.mocked(loadClients).mockResolvedValue([{ ...client, manager_user_id: adminUserId }])
  vi.mocked(runManagerAction).mockRejectedValue(new Error('Telegram отклонил сообщение.'))
  renderPage()
  const draft = await screen.findByRole('textbox', { name: 'Ответ менеджера' })
  const send = screen.getByRole('button', { name: 'Отправить' })
  expect(send).toBeDisabled()
  fireEvent.change(draft, { target: { value: 'Мой ответ' } })
  fireEvent.click(send)
  expect(await screen.findByText('Telegram отклонил сообщение.')).toBeVisible()
  expect(draft).toHaveValue('Мой ответ')
  await waitFor(() => expect(send).toBeEnabled())

  act(() => vi.mocked(subscribeToChats).mock.calls[0][0].onClient({ ...client, manager_user_id: 'another-admin' }))
  expect(await screen.findByText('Диалог ведёт другой менеджер')).toBeVisible()
  expect(screen.queryByRole('textbox', { name: 'Ответ менеджера' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Подключиться' })).not.toBeInTheDocument()
})
