import type { ExchangeAdminSession } from '../application/admin-session.ts'

const routes = {
  login: { method: 'POST', path: '/token?grant_type=password' },
  refresh: { method: 'POST', path: '/token?grant_type=refresh_token' },
  session: { method: 'GET', path: '/user' },
  logout: { method: 'POST', path: '/logout?scope=local' },
}

export function createSupabaseAuthExchange(authUrl: string, apiKey: string, fetchAuth = fetch): ExchangeAdminSession<Response> {
  return async command => {
    const route = routes[command.action]
    const headers = new Headers({
      apikey: apiKey, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01',
    })
    let body: string | undefined
    switch (command.action) {
      case 'login':
        body = JSON.stringify({ email: command.email, password: command.password })
        break
      case 'refresh':
        body = JSON.stringify({ refresh_token: command.refreshToken })
        break
      case 'session':
      case 'logout':
        headers.set('Authorization', 'Bearer ' + command.token)
        break
    }

    const response = await fetchAuth(authUrl + route.path, {
      method: route.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (response.status >= 500) return { kind: 'unavailable' }
    if (!response.ok || command.action === 'logout') return { kind: 'forward', response }

    const payload = await response.json()
    const userId = command.action === 'session' ? payload?.id : payload?.user?.id
    return { kind: 'identity', userId: typeof userId === 'string' ? userId : undefined, payload }
  }
}
