import type {
  TelegramUpdate,
  TelegramWebhookAction,
} from '../telegram/telegram-types.ts'

type ProcessTelegramUpdate = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

interface TelegramWebhookControllerOptions {
  webhookSecret: string | undefined
  processTelegramUpdate: ProcessTelegramUpdate | undefined
}

function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  return typeof value === 'object' && value !== null
}

export function createTelegramWebhookController({
  webhookSecret,
  processTelegramUpdate,
}: TelegramWebhookControllerOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method Not Allowed' },
        { status: 405 },
      )
    }

    if (!webhookSecret || !processTelegramUpdate) {
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      )
    }

    const providedSecret = request.headers.get(
      'x-telegram-bot-api-secret-token',
    )

    if (providedSecret !== webhookSecret) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    let update: unknown

    try {
      update = await request.json()
    } catch {
      return Response.json(
        { error: 'Bad Request' },
        { status: 400 },
      )
    }

    if (!isTelegramUpdate(update)) {
      return Response.json(
        { error: 'Bad Request' },
        { status: 400 },
      )
    }

    try {
      const action = await processTelegramUpdate(update)
      return Response.json(action ?? { ok: true })
    } catch (error) {
      console.error('Failed to handle Telegram update', error)
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      )
    }
  }
}
