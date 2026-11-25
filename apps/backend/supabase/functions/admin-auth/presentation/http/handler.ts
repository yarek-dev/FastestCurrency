import { corsHeaders } from '../../../_shared/presentation/http/cors.ts'
import { bearerToken, inboxError } from '../../../_shared/presentation/http/inbox-access.ts'
import type { AdminSessionCommand, createAdminSession } from '../../application/admin-session.ts'

const headers = { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' }

export function createAdminAuthHandler(session?: ReturnType<typeof createAdminSession<Response>>) {
  return async (request: Request): Promise<Response> => {
    const action = /^\/(?:functions\/v1\/)?admin-auth\/(login|refresh|session|logout)$/.exec(new URL(request.url).pathname)?.[1] as AdminSessionCommand['action'] | undefined
    if (!action) return Response.json({ error: 'Not Found' }, { status: 404, headers })
    const method = action === 'session' ? 'GET' : 'POST'
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== method) {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { ...headers, Allow: method + ', OPTIONS' } })
    }
    if (!session) return inboxError(500, headers)

    let command: AdminSessionCommand
    if (action === 'login' || action === 'refresh') {
      const input = await request.json().catch(() => null)
      if (action === 'login' && typeof input?.email === 'string' && typeof input?.password === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) && input.email.length <= 254 &&
        input.password.length >= 8 && input.password.length <= 72) {
        command = { action, email: input.email, password: input.password }
      } else if (action === 'refresh' && typeof input?.refresh_token === 'string' && /^[\w-]{1,1024}$/.test(input.refresh_token)) {
        command = { action, refreshToken: input.refresh_token }
      } else {
        return Response.json({ error: 'Invalid request' }, { status: 400, headers })
      }
    } else {
      const token = bearerToken(request)
      if (!token) return inboxError(401, headers)
      command = { action, token }
    }

    const result = await session(command)
    switch (result.kind) {
      case 'identity': return Response.json(result.payload, { headers })
      case 'forbidden': return inboxError(403, headers)
      case 'unavailable': return inboxError(503, headers)
      case 'forward': {
        const { response } = result
        const responseHeaders = new Headers(headers)
        const contentType = response.headers.get('Content-Type')
        if (contentType) responseHeaders.set('Content-Type', contentType)
        return new Response(response.body, { status: response.status, headers: responseHeaders })
      }
    }
  }
}
