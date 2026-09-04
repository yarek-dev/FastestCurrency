import type { Logger } from '../../../application/ports/logger.js'
import type { GetPeriodChange } from '../../../application/use-cases/get-period-change.js'
import { isUnsupportedCurrencyError } from '../../../domain/errors.js'
import { toError } from '../../../shared/errors.js'
import { createSendMessageAction } from '../telegram-actions.js'
import { parsePeriodCallbackData } from '../input/telegram-callback-data.js'
import { formatPeriodChangeResult } from '../messages/telegram-result-formatter.js'
import {
  formatServiceUnavailable,
  formatUnsupportedCurrency,
} from '../messages/telegram-static-messages.js'
import type { TelegramUpdate, TelegramWebhookAction } from '../telegram-types.js'

export type HandleTelegramCallbackQuery = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

export interface TelegramCallbackQueryHandlerOptions {
  answerCallbackQuery: (callbackQueryId: string) => Promise<void>
  getPeriodChange: GetPeriodChange
  logger: Logger
}

export function createTelegramCallbackQueryHandler({
  answerCallbackQuery,
  getPeriodChange,
  logger,
}: TelegramCallbackQueryHandlerOptions): HandleTelegramCallbackQuery {
  return async (update) => {
    const callbackQuery = update.callback_query

    if (!callbackQuery?.id) {
      return
    }

    const acknowledgement = answerCallbackQuery(callbackQuery.id).catch((error) => {
      const normalizedError = toError(error, 'Unknown Telegram callback error')
      logger.warn({
        updateId: update.update_id,
        callbackQueryId: callbackQuery.id,
        errorMessage: normalizedError.message,
      }, 'Failed to acknowledge Telegram callback query')
    })
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
    const periodContext = {
      updateId: update.update_id,
      chatId: callbackMessage.chat.id,
      base: callbackData.base,
      quote: callbackData.quote,
      provider: callbackData.provider,
      days: callbackData.days,
    }

    try {
      const result = await getPeriodChange({
        ...callbackData,
        ...(referenceDate ? { referenceDate } : {}),
      })
      await acknowledgement

      logger.info(periodContext, 'Currency period change completed')

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

      const normalizedError = toError(error, 'Unknown period change error')
      logger.error({
        ...periodContext,
        errorName: normalizedError.name,
        errorMessage: normalizedError.message,
      }, 'Currency period change failed')

      return createSendMessageAction(
        callbackMessage.chat.id,
        formatServiceUnavailable(),
      )
    }
  }
}
