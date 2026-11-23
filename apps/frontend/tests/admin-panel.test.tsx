import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { AdminPanel } from '@frontend/src/modules/auth/admin-panel'

const { auth, chats } = vi.hoisted(() => ({
  auth: { onAuthStateChange: vi.fn(), getUser: vi.fn(), signOut: vi.fn() },
  chats: vi.fn(),
}))
vi.mock('@frontend/src/lib/supabase', () => ({ getInboxClient: () => client }))
vi.mock('@frontend/src/modules/chats', () => ({
  ChatsPage: ({ headerAction }: { headerAction: React.ReactNode }) => {
    chats()
    return <section aria-label="Переписки">{headerAction}</section>
  },
}))
const client = { auth }

test('mounts chats only after checking the admin session and removes them on sign-out', async () => {
  let authChanged!: (event: string, session: Session | null) => void
  const adminSession = { user: { id: 'admin' } } as Session
  auth.onAuthStateChange.mockImplementation(callback => {
    authChanged = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  let finishCheck!: (value: unknown) => void
  auth.getUser.mockImplementation(() => new Promise(resolve => { finishCheck = resolve }))
  auth.signOut.mockImplementation(async () => {
    authChanged('SIGNED_OUT', null)
    return { error: null }
  })

  render(<AdminPanel />)
  act(() => authChanged('INITIAL_SESSION', adminSession))
  expect(screen.getByRole('status')).toHaveTextContent('Проверяем сессию…')
  expect(chats).not.toHaveBeenCalled()
  await act(async () => finishCheck({ data: { user: adminSession.user }, error: null }))
  expect(screen.getByRole('region', { name: 'Переписки' })).toBeVisible()

  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
  expect(await screen.findByRole('heading', { name: 'Вход в админ-панель' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Переписки' })).toBeNull()
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
})
