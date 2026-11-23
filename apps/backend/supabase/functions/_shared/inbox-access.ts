import type { createSupabaseAdminClient } from './supabase-admin.ts'

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>

export function bearerToken(request: Request): string | undefined {
  return /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
}

export async function inboxAdminStatus(supabase: AdminClient, userId: string): Promise<200 | 403 | 503> {
  const { data, error } = await supabase.from('inbox_admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) return 503
  return data ? 200 : 403
}

export async function authorizeInbox(supabase: AdminClient, request: Request) {
  const token = bearerToken(request)
  if (!token) return 401

  const { data, error } = await supabase.auth.getUser(token)
  if (error) return error.status === 400 || error.status === 401 || error.status === 403 ? 401 : 503
  if (!data.user) return 401
  return inboxAdminStatus(supabase, data.user.id)
}

export function inboxError(status: 401 | 403 | 500 | 503, headers: HeadersInit): Response {
  const messages = { 401: 'Unauthorized', 403: 'Forbidden', 500: 'Internal Server Error', 503: 'Service Unavailable' }
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Cache-Control', 'no-store')
  return Response.json({ error: messages[status] }, { status, headers: responseHeaders })
}
