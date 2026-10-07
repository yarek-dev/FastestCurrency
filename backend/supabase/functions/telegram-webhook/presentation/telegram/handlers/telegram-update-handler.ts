import type { ConvertCurrency } from '@backend/supabase/functions/telegram-webhook/application/use-cases/convert-currency.ts'
import type { GetPeriodChange } from '@backend/supabase/functions/telegram-webhook/application/use-cases/get-period-change.ts'
import { createTelegramCallbackQueryHandler } from './telegram-callback-query-handler.ts'
import { createTelegramMessageHandler } from './telegram-message-handler.ts'
import type { TelegramUpdate, TelegramWebhookAction } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-types.ts'

export type HandleTelegramUpdate = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

interface TelegramUpdateHandlerOptions {
  answerCallbackQuery: (callbackQueryId: string) => Promise<void>
  convertCurrency: ConvertCurrency
  getPeriodChange: GetPeriodChange
}

export function createTelegramUpdateHandler({
  answerCallbackQuery,
  convertCurrency,
  getPeriodChange,
}: TelegramUpdateHandlerOptions): HandleTelegramUpdate {
  const handleCallbackQuery = createTelegramCallbackQueryHandler({
    answerCallbackQuery,
    getPeriodChange,
  })
  const handleMessage = createTelegramMessageHandler({ convertCurrency })

  return (update) => update.callback_query?.id
    ? handleCallbackQuery(update)
    : handleMessage(update)
}
