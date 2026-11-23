import { inboxError } from '../_shared/inbox-access.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { validId } from './pagination.ts'

export const messageCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const headers = { ...messageCorsHeaders, 'Cache-Control': 'no-store' }
type ManagerAction = 'connect' | 'send' | 'finish'
export type Delivery = 'done' | 'failed' | 'unknown'
export interface TelegramTextEntity {
  type: 'bold' | 'italic'
  offset: number
  length: number
}
type Reservation =
  | { status: 'ready'; chat_id: string }
  | { status: 'rate_limited'; retry_after: number }
  | { status: Delivery | 'missing' | 'conflict' | 'pending' | 'forbidden' }

interface Operation {
  clientId: string
  requestId: string
}

interface Dependencies {
  identify: (request: Request) => Promise<{ status: 200; userId: string } | { status: 401 | 403 | 503 }>
  begin: (operation: Operation & { userId: string; action: ManagerAction; body: string }) => Promise<Reservation>
  deliver: (chatId: string, text: string, entity: TelegramTextEntity) => Promise<Delivery>
  complete: (operation: Operation, delivery: Delivery) => Promise<Record<string, unknown> | null>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const managerHeading = '🎧 Менеджер'
const notices = {
  connect: { marker: '🟢 ', body: 'Менеджер подключился' },
  finish: { marker: '⚪ ', body: 'Менеджер завершил диалог' },
}

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers })
}

function deliveryError(state: 'failed' | 'unknown') {
  return json(502, { error: state === 'failed' ? 'telegram_rejected' : 'delivery_unknown' })
}

export function createInboxManagerHandler({ identify, begin, deliver, complete }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    let sending = false
    try {
      const admin = await identify(request)
      if (admin.status !== 200) return inboxError(admin.status, headers)

      const input = await request.json().catch(() => null)
      if (!input || !validId(input.clientId) || typeof input.requestId !== 'string' ||
        !uuid.test(input.requestId) || !['connect', 'send', 'finish'].includes(input.action)) {
        return json(400, { error: 'invalid_request' })
      }
      const action: ManagerAction = input.action
      const operation = { clientId: input.clientId, requestId: input.requestId }
      const notice = action === 'send' ? undefined : notices[action]
      const body = notice?.body ?? (typeof input.text === 'string' ? input.text.trim() : '')
      const prefix = notice?.marker ?? `${managerHeading}\n\n`
      const text = prefix + body
      const entity: TelegramTextEntity = notice
        ? { type: 'italic', offset: notice.marker.length, length: body.length }
        : { type: 'bold', offset: 0, length: managerHeading.length }
      if (!body || text.length > 4096) return json(400, { error: 'invalid_text' })

      const reservation = await begin({ ...operation, action, body, userId: admin.userId })
      switch (reservation.status) {
        case 'done': return json(200, { ok: true })
        case 'rate_limited':
          return Response.json({ error: 'rate_limited', retryAfter: reservation.retry_after }, {
            status: 429,
            headers: { ...headers, 'Retry-After': String(reservation.retry_after), 'Access-Control-Expose-Headers': 'Retry-After' },
          })
        case 'forbidden': return inboxError(403, headers)
        case 'missing': return json(404, { error: 'dialog_missing' })
        case 'conflict':
        case 'pending': return json(409, { error: 'dialog_conflict' })
        case 'failed':
        case 'unknown': return deliveryError(reservation.status)
        case 'ready': {
          sending = true
          const outcome = await deliver(reservation.chat_id, text, entity).catch(() => 'unknown' as const)
          const message = await complete(operation, outcome)
          if (outcome !== 'done') return deliveryError(outcome)
          return message ? json(200, { ok: true, message }) : deliveryError('unknown')
        }
      }
    } catch {
      console.error('Inbox manager action failed')
      return sending ? deliveryError('unknown') : inboxError(500, headers)
    }
  }
}
