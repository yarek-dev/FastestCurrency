import type { GetPeriodChange } from '@backend/supabase/functions/telegram-webhook/application/use-cases/get-period-change.ts'
import { isUnsupportedCurrencyError } from '@backend/supabase/functions/telegram-webhook/domain/errors.ts'
import { createSendMessageAction } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-actions.ts'
import { parsePeriodCallbackData } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/input/telegram-callback-data.ts'
import { formatPeriodChangeResult } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/messages/telegram-result-formatter.ts'
import {
  formatServiceUnavailable,
  formatUnsupportedCurrency,
} from '@backend/supabase/functions/telegram-webhook/presentation/telegram/messages/telegram-static-messages.ts'
import type { TelegramUpdate, TelegramWebhookAction } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-types.ts'

export type HandleTelegramCallbackQuery = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

export interface TelegramCallbackQueryHandlerOptions {
  answerCallbackQuery: (callbackQueryId: string) => Promise<void>
  getPeriodChange: GetPeriodChange
}

export function createTelegramCallbackQueryHandler({
  answerCallbackQuery,
  getPeriodChange,
}: TelegramCallbackQueryHandlerOptions): HandleTelegramCallbackQuery {
  return async (update) => {
    const callbackQuery = update.callback_query

    if (!callbackQuery?.id) {
      return
    }

    const acknowledgement = answerCallbackQuery(callbackQuery.id).catch(() => undefined)
    const callbackData = typeof callbackQuery.data === 'string'
      ? parsePeriodCallbackData(callbackQuery.data)
      : undefined
    const callbackMessage = callbackQuery.message

    if (
      !callbackData
      || callbackMessage?.chat?.type !== 'private'
      || typeof callbackMessage.chat.id !== 'number'
    ) {
      await acknowledgement
      return
    }

    const referenceDate = typeof callbackMessage.date === 'number'
      && Number.isFinite(callbackMessage.date)
      && callbackMessage.date > 0
      ? new Date(callbackMessage.date * 1_000)
      : undefined

    try {
      const result = await getPeriodChange({
        ...callbackData,
        ...(referenceDate ? { referenceDate } : {}),
      })
      await acknowledgement

      return createSendMessageAction(
        callbackMessage.chat.id,
        formatPeriodChangeResult(result),
      )
    } catch (error) {
      await acknowledgement

      if (isUnsupportedCurrencyError(error)) {
        return createSendMessageAction(
          callbackMessage.chat.id,
          formatUnsupportedCurrency(error.currencies),
        )
      }

      return createSendMessageAction(
        callbackMessage.chat.id,
        formatServiceUnavailable(),
      )
    }
  }
}
