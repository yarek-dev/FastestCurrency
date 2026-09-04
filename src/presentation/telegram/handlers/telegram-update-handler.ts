import type { Logger } from '../../../application/ports/logger.js'
import type { ConvertCurrency } from '../../../application/use-cases/convert-currency.js'
import type { GetPeriodChange } from '../../../application/use-cases/get-period-change.js'
import { createTelegramCallbackQueryHandler } from './telegram-callback-query-handler.js'
import { createTelegramMessageHandler } from './telegram-message-handler.js'
import type { TelegramUpdate, TelegramWebhookAction } from '../telegram-types.js'

export type HandleTelegramUpdate = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

interface TelegramUpdateHandlerOptions {
  answerCallbackQuery: (callbackQueryId: string) => Promise<void>
  convertCurrency: ConvertCurrency
  getPeriodChange: GetPeriodChange
  logger: Logger
}

export function createTelegramUpdateHandler({
  answerCallbackQuery,
  convertCurrency,
  getPeriodChange,
  logger,
}: TelegramUpdateHandlerOptions): HandleTelegramUpdate {
  const handleCallbackQuery = createTelegramCallbackQueryHandler({
    answerCallbackQuery,
    getPeriodChange,
    logger,
  })
  const handleMessage = createTelegramMessageHandler({
    convertCurrency,
    logger,
  })

  return (update) => update.callback_query?.id
    ? handleCallbackQuery(update)
    : handleMessage(update)
}
