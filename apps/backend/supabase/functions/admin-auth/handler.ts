import { corsHeaders } from '../_shared/cors.ts'
import { bearerToken, inboxError } from '../_shared/inbox-access.ts'

const headers = { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }
const routes = {
  login: { method: 'POST', path: '/token?grant_type=password' },
  refresh: { method: 'POST', path: '/token?grant_type=refresh_token' },
  session: { method: 'GET', path: '/user' },
  logout: { method: 'POST', path: '/logout?scope=local' },
} as const

interface AuthDependencies {
  authUrl: string
  apiKey: string
  checkAdmin: (userId: string) => Promise<200 | 403 | 503>
  fetchAuth?: typeof fetch
}

export function createAdminAuthHandler(dependencies?: AuthDependencies) {
  return async (request: Request): Promise<Response> => {
    const action = /^\/(?:functions\/v1\/)?admin-auth\/(login|refresh|session|logout)$/.exec(new URL(request.url).pathname)?.[1] as keyof typeof routes | undefined
    if (!action) return Response.json({ error: 'Not Found' }, { status: 404, headers })
    const route = routes[action]
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== route.method) {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { ...headers, Allow: route.method + ', OPTIONS' } })
    }
    if (!dependencies) return inboxError(500, headers)
    const { authUrl, apiKey, checkAdmin, fetchAuth = fetch } = dependencies

    const upstreamHeaders = new Headers({
      apikey: apiKey,
      'Content-Type': 'application/json',
      'X-Supabase-Api-Version': '2024-01-01',
    })
    let body: string | undefined
    if (action === 'login' || action === 'refresh') {
      const input = await request.json().catch(() => null)
      if (action === 'login' && typeof input?.email === 'string' && typeof input?.password === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) && input.email.length <= 254 &&
        input.password.length >= 8 && input.password.length <= 72) {
        body = JSON.stringify({ email: input.email, password: input.password })
      }
      if (action === 'refresh' && typeof input?.refresh_token === 'string' && /^[\w-]{1,1024}$/.test(input.refresh_token)) {
        body = JSON.stringify({ refresh_token: input.refresh_token })
      }
      if (!body) return Response.json({ error: 'Invalid request' }, { status: 400, headers })
    } else {
      const token = bearerToken(request)
      if (!token) return inboxError(401, headers)
      upstreamHeaders.set('Authorization', 'Bearer ' + token)
    }

    try {
      const upstream = await fetchAuth(authUrl + route.path, {
        method: route.method, headers: upstreamHeaders, body, redirect: 'error', signal: AbortSignal.timeout(10_000),
      })
      if (upstream.ok && action !== 'logout') {
        const result = await upstream.json()
        const userId = action === 'session' ? result?.id : result?.user?.id
        if (typeof userId !== 'string') return inboxError(503, headers)
        const access = await checkAdmin(userId)
        if (access !== 200) return inboxError(access, headers)
        return Response.json(result, { headers })
      }

      if (upstream.status >= 500) return inboxError(503, headers)
      const responseHeaders = new Headers(headers)
      const contentType = upstream.headers.get('Content-Type')
      if (contentType) responseHeaders.set('Content-Type', contentType)
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
    } catch {
      return inboxError(503, headers)
    }
  }
}
