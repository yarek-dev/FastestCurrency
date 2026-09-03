import { requireEnvironmentVariable } from './environment-variable.js'

export interface Environment {
  currencyBeaconApiKey: string | undefined
  port: number
  telegramWebhookSecret: string
}

export function loadEnvironment(): Environment {
  const configuredPort = Number(process.env.PORT)

  return {
    currencyBeaconApiKey: process.env.CURRENCY_BEACON_API_KEY || undefined,
    port: Number.isInteger(configuredPort) && configuredPort > 0
      ? configuredPort
      : 3000,
    telegramWebhookSecret: requireEnvironmentVariable('TELEGRAM_WEBHOOK_SECRET'),
  }
}
