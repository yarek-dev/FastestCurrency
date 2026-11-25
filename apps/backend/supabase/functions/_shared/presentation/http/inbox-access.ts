import type { createResolveInboxAdmin } from '../../application/inbox-access.ts'

export function bearerToken(request: Request): string | undefined {
  return /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
}

export type IdentifyInboxAdmin = (request: Request) => Promise<
  { status: 200; userId: string } | { status: 401 | 403 | 503 }
>

export function createIdentifyInboxAdmin(resolveAdmin: ReturnType<typeof createResolveInboxAdmin>): IdentifyInboxAdmin {
  return async request => {
    const token = bearerToken(request)
    if (!token) return { status: 401 }
    const admin = await resolveAdmin(token)
    switch (admin.status) {
      case 'resolved': return { status: 200, userId: admin.userId }
      case 'unauthorized': return { status: 401 }
      case 'forbidden': return { status: 403 }
      case 'unavailable': return { status: 503 }
    }
  }
}

export function inboxError(status: 401 | 403 | 500 | 503, headers: HeadersInit): Response {
  const messages = { 401: 'Unauthorized', 403: 'Forbidden', 500: 'Internal Server Error', 503: 'Service Unavailable' }
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Cache-Control', 'no-store')
  return Response.json({ error: messages[status] }, { status, headers: responseHeaders })
}
