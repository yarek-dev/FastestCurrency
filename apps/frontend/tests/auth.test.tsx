import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { adminAuthFetch } from '@frontend/src/lib/supabase'
import { LoginForm } from '@frontend/src/modules/auth/login-form'

afterEach(() => vi.unstubAllGlobals())

test('validates the email and password before sending credentials', async () => {
  const signIn = vi.fn().mockResolvedValue('Проверьте email и пароль.')
  render(<LoginForm signIn={signIn} />)
  const email = screen.getByLabelText('Email')
  const password = screen.getByLabelText('Пароль')
  fireEvent.change(email, { target: { value: 'incorrect' } })
  fireEvent.change(password, { target: { value: 'short' } })
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
  expect(await screen.findByText('Введите корректный email.')).toBeVisible()
  expect(screen.getByText('Минимум 8 символов.')).toBeVisible()
  expect(signIn).not.toHaveBeenCalled()

  fireEvent.change(email, { target: { value: 'admin@example.com' } })
  fireEvent.change(password, { target: { value: 'password with spaces ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте email и пароль.')
  expect(signIn).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'password with spaces ' })
})

test('the SDK sends password login, session, refresh and logout to the Edge Function', async () => {
  const url = 'https://example.supabase.co'
  const user = { id: 'admin', email: 'admin@example.com' }
  const session = {
    access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
  }
  const fetch = vi.fn(async (input: URL) => {
    if (input.pathname.endsWith('/session')) return Response.json(user)
    if (input.pathname.endsWith('/logout')) return new Response(null, { status: 204 })
    return Response.json(session)
  })
  vi.stubGlobal('fetch', fetch)
  const client = createClient(url, 'test-public-key', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false, storageKey: 'test-admin-auth' },
    global: { fetch: adminAuthFetch(url) },
  })
  expect((await client.auth.signInWithPassword({ email: user.email, password: 'test-password' })).error).toBeNull()
  expect((await client.auth.getUser()).error).toBeNull()
  expect((await client.auth.refreshSession()).error).toBeNull()
  expect((await client.auth.signOut({ scope: 'local' })).error).toBeNull()
  await waitFor(() => expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
    url + '/functions/v1/admin-auth/login',
    url + '/functions/v1/admin-auth/session',
    url + '/functions/v1/admin-auth/refresh',
    url + '/functions/v1/admin-auth/logout',
  ]))

  const unsupported = await adminAuthFetch(url)(url + '/auth/v1/signup', { method: 'POST' })
  expect(unsupported.status).toBe(404)
  expect(fetch).toHaveBeenCalledTimes(4)
})
