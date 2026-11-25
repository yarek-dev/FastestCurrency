import { deepStrictEqual as assertEquals } from 'node:assert/strict'
import { createAdminAuthHandler } from '@backend/supabase/functions/admin-auth/presentation/http/handler.ts'
import { createAdminSession } from '@backend/supabase/functions/admin-auth/application/admin-session.ts'
import { createSupabaseAuthExchange } from '@backend/supabase/functions/admin-auth/infrastructure/supabase-auth-exchange.ts'
import type { CheckInboxGrant } from '@backend/supabase/functions/_shared/application/inbox-access.ts'

const credentials = { email: 'admin@example.com', password: 'example-password' }
const session = { access_token: 'test-access', refresh_token: 'test-refresh', user: { id: 'test-user' } }

function createHandler({ checkAdmin, fetchAuth }: { checkAdmin: CheckInboxGrant; fetchAuth: typeof fetch }) {
  return createAdminAuthHandler(createAdminSession(
    createSupabaseAuthExchange('http://auth.test/auth/v1', 'public-key', fetchAuth),
    checkAdmin,
  ))
}

function request(action: string, method: string, body?: unknown, headers?: HeadersInit) {
  return new Request('http://localhost/functions/v1/admin-auth/' + action, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
}

Deno.test('validates login requests and exposes only the four auth operations', async () => {
  const handler = createHandler({
    checkAdmin: () => Promise.resolve('allowed'),
    fetchAuth: () => { throw new Error('unexpected upstream call') },
  })
  assertEquals((await handler(request('login', 'POST', { ...credentials, password: 'short' }))).status, 400)
  assertEquals((await handler(request('signup', 'POST', credentials))).status, 404)
  assertEquals((await handler(request('login', 'GET'))).status, 405)
  assertEquals((await handler(request('session', 'GET'))).status, 401)
  assertEquals((await handler(request('login', 'OPTIONS'))).status, 204)
})

Deno.test('returns a session only for admins at login and refresh', async () => {
  let admin = true
  const calls: Array<{ url: string; body: unknown; authorization: string | null }> = []
  const handler = createHandler({
    checkAdmin: userId => Promise.resolve(admin && userId === 'test-user' ? 'allowed' : 'forbidden'),
    fetchAuth: (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get('authorization') })
      return Promise.resolve(Response.json(session))
    },
  })
  const login = await handler(request('login', 'POST', { ...credentials, redirect_to: 'http://other.test' }))
  assertEquals(login.status, 200)
  assertEquals(login.headers.get('cache-control'), 'no-store')
  assertEquals(await login.json(), session)
  admin = false
  const refresh = await handler(request('refresh', 'POST', { refresh_token: 'test-refresh' }))
  assertEquals(refresh.status, 403)
  assertEquals(await refresh.json(), { error: 'Forbidden' })
  assertEquals(calls, [
    { url: 'http://auth.test/auth/v1/token?grant_type=password', body: credentials, authorization: null },
    { url: 'http://auth.test/auth/v1/token?grant_type=refresh_token', body: { refresh_token: 'test-refresh' }, authorization: null },
  ])
})

Deno.test('revoked users cannot restore the panel but can still log out', async () => {
  const handler = createHandler({
    checkAdmin: () => Promise.resolve('forbidden'),
    fetchAuth: (input, init) => {
      assertEquals(new Headers(init?.headers).get('authorization'), 'Bearer test-access')
      return Promise.resolve(String(input).endsWith('/user')
        ? Response.json({ id: 'test-user' })
        : new Response(null, { status: 204 }))
    },
  })
  const authorization = { authorization: 'Bearer test-access' }
  assertEquals((await handler(request('session', 'GET', undefined, authorization))).status, 403)
  assertEquals((await handler(request('logout', 'POST', undefined, authorization))).status, 204)
})
