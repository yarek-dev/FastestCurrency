import { requireEnvironmentVariable } from '../src/config/environment-variable.js'
import { toError } from '../src/shared/errors.js'

interface TelegramApiResponse {
  ok: boolean
  description?: string
}

function getWebhookUrl(): string {
  const value = requireEnvironmentVariable('TELEGRAM_WEBHOOK_URL')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('TELEGRAM_WEBHOOK_URL must be a valid URL')
  }

  if (url.protocol !== 'https:') {
    throw new Error('TELEGRAM_WEBHOOK_URL must use HTTPS')
  }

  return url.toString()
}

async function setTelegramWebhook(): Promise<void> {
  const botToken = requireEnvironmentVariable('TELEGRAM_BOT_TOKEN')
  const webhookSecret = requireEnvironmentVariable('TELEGRAM_WEBHOOK_SECRET')
  const webhookUrl = getWebhookUrl()

  let response: Response
  try {
    response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query'],
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch {
    throw new Error('Failed to connect to Telegram Bot API')
  }

  let payload: TelegramApiResponse
  try {
    payload = await response.json() as TelegramApiResponse
  } catch {
    throw new Error(`Telegram Bot API returned invalid JSON (HTTP ${response.status})`)
  }

  if (!response.ok || payload.ok !== true) {
    const description = payload.description ?? `HTTP ${response.status}`
    throw new Error(`Telegram rejected webhook configuration: ${description}`)
  }

  console.log(`Telegram webhook configured: ${webhookUrl}`)
  console.log('Allowed updates: message, callback_query')
}

try {
  await setTelegramWebhook()
} catch (error) {
  const message = toError(error, 'Unknown error').message
  console.error(`Failed to configure Telegram webhook: ${message}`)
  process.exitCode = 1
}
