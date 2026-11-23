import type { GetPeriodChange } from '../../../application/use-cases/get-period-change.ts'
import { isUnsupportedCurrencyError } from '../../../domain/errors.ts'
import { createSendMessageAction } from '../telegram-actions.ts'
import { parsePeriodCallbackData } from '../input/telegram-callback-data.ts'
import { formatPeriodChangeResult } from '../messages/telegram-result-formatter.ts'
import {
  formatServiceUnavailable,
  formatUnsupportedCurrency,
} from '../messages/telegram-static-messages.ts'
import type { TelegramUpdate, TelegramWebhookAction } from '../telegram-types.ts'

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
