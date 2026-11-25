import { inboxError, type IdentifyInboxAdmin } from '../../../_shared/presentation/http/inbox-access.ts'
import { corsHeaders } from '../../../_shared/presentation/http/cors.ts'
import type { ManageConversation, ManagerAction } from '../../application/manage-conversation.ts'
import { validId } from './pagination.ts'

export const messageCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const headers = { ...messageCorsHeaders, 'Cache-Control': 'no-store' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers })
}

export function createInboxManagerHandler(identify: IdentifyInboxAdmin, manage: ManageConversation) {
  return async (request: Request): Promise<Response> => {
    try {
      const admin = await identify(request)
      if (admin.status !== 200) return inboxError(admin.status, headers)

      const input = await request.json().catch(() => null)
      if (!input || !validId(input.clientId) || typeof input.requestId !== 'string' ||
        !uuid.test(input.requestId) || !['connect', 'send', 'finish'].includes(input.action)) {
        return json(400, { error: 'invalid_request' })
      }

      const result = await manage({
        clientId: input.clientId,
        requestId: input.requestId,
        userId: admin.userId,
        action: input.action as ManagerAction,
        text: typeof input.text === 'string' ? input.text : '',
      })
      switch (result.status) {
        case 'done': return json(200, 'message' in result ? { ok: true, message: result.message } : { ok: true })
        case 'invalid_text': return json(400, { error: 'invalid_text' })
        case 'rate_limited':
          return Response.json({ error: 'rate_limited', retryAfter: result.retryAfter }, {
            status: 429,
            headers: { ...headers, 'Retry-After': String(result.retryAfter), 'Access-Control-Expose-Headers': 'Retry-After' },
          })
        case 'forbidden': return inboxError(403, headers)
        case 'missing': return json(404, { error: 'dialog_missing' })
        case 'conflict':
        case 'pending': return json(409, { error: 'dialog_conflict' })
        case 'failed': return json(502, { error: 'telegram_rejected' })
        case 'unknown': return json(502, { error: 'delivery_unknown' })
      }
    } catch {
      console.error('Inbox manager action failed')
      return inboxError(500, headers)
    }
  }
}
