export type ManagerAction = 'connect' | 'send' | 'finish'
export type Delivery = 'done' | 'failed' | 'unknown'

interface Operation {
  clientId: string
  requestId: string
}

export interface ManagerCommand extends Operation {
  userId: string
  action: ManagerAction
  text: string
}

type Reservation =
  | { status: 'ready'; destination: string }
  | { status: 'rate_limited'; retryAfter: number }
  | { status: Delivery | 'missing' | 'conflict' | 'pending' | 'forbidden' }

export interface ManagerOperations {
  begin: (operation: Operation & { userId: string; action: ManagerAction; body: string }) => Promise<Reservation>
  complete: (operation: Operation, delivery: Delivery) => Promise<Record<string, unknown> | null>
}

export type DeliverManagerMessage = (
  destination: string, message: { action: ManagerAction; body: string },
) => Promise<Delivery>

const noticeTexts = { connect: 'Менеджер подключился', finish: 'Менеджер завершил диалог' }
// Keep space for the manager heading and line breaks in the delivered message.
const managerReplyLimit = 4083

export function createManageConversation(operations: ManagerOperations, deliver: DeliverManagerMessage) {
  return async ({ clientId, requestId, userId, action, text }: ManagerCommand) => {
    const body = action === 'send' ? text.trim() : noticeTexts[action]
    if (!body || body.length > managerReplyLimit) return { status: 'invalid_text' } as const

    const operation = { clientId, requestId }
    const reservation = await operations.begin({ ...operation, action, body, userId })
    if (reservation.status !== 'ready') return reservation

    try {
      const outcome = await deliver(reservation.destination, { action, body }).catch(() => 'unknown' as const)
      const message = await operations.complete(operation, outcome)
      if (outcome !== 'done') return { status: outcome }
      return message ? { status: 'done', message } as const : { status: 'unknown' } as const
    } catch {
      console.error('Inbox manager action failed')
      return { status: 'unknown' } as const
    }
  }
}

export type ManageConversation = ReturnType<typeof createManageConversation>
