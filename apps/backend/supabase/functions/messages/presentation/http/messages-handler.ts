import type { InboxReader } from '../../../_shared/application/inbox-reader.ts'
import { inboxError, type IdentifyInboxAdmin } from '../../../_shared/presentation/http/inbox-access.ts'
import { messageCorsHeaders as headers } from './manager-handler.ts'
import { parsePagination, toPage } from './pagination.ts'

export function createMessagesHandler(dependencies?: {
  identify: IdentifyInboxAdmin
  readHistory: InboxReader['readHistory']
  manage?: (request: Request) => Promise<Response>
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method === 'POST') return dependencies?.manage?.(request) ?? inboxError(503, headers)
    if (request.method !== 'GET') {
      return Response.json({ error: 'Method Not Allowed' }, {
        status: 405, headers: { ...headers, Allow: 'GET, POST, OPTIONS' },
      })
    }

    if (!dependencies) return inboxError(500, headers)
    const { status: access } = await dependencies.identify(request)
    if (access !== 200) return inboxError(access, headers)

    let query: ReturnType<typeof parsePagination>
    try {
      query = parsePagination(new URL(request.url))
    } catch {
      return Response.json({ error: 'Invalid pagination parameters' }, { status: 400, headers })
    }

    try {
      return Response.json(toPage(await dependencies.readHistory(query)), {
        headers: { ...headers, 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      console.error('Failed to load messages', error)
      return Response.json({ error: 'Internal Server Error' }, { status: 500, headers })
    }
  }
}
