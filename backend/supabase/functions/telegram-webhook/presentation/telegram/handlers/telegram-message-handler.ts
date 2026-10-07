import type { ConvertCurrency } from '@backend/supabase/functions/telegram-webhook/application/use-cases/convert-currency.ts'
import {
  isAllProvidersFailedError,
  isUnsupportedCurrencyError,
} from '@backend/supabase/functions/telegram-webhook/domain/errors.ts'
import { createSendMessageAction } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-actions.ts'
import { createPeriodKeyboard } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/input/telegram-callback-data.ts'
import { parseTelegramInput } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/input/telegram-update-parser.ts'
import { formatConversionResult } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/messages/telegram-result-formatter.ts'
import {
  formatFallbackUnavailable,
  formatHelpMessage,
  formatParseError,
  formatServiceUnavailable,
  formatStartMessage,
  formatUnsupportedCurrency,
} from '@backend/supabase/functions/telegram-webhook/presentation/telegram/messages/telegram-static-messages.ts'
import type { TelegramUpdate, TelegramWebhookAction } from '@backend/supabase/functions/telegram-webhook/presentation/telegram/telegram-types.ts'

export type HandleTelegramMessage = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

export interface TelegramMessageHandlerOptions {
  convertCurrency: ConvertCurrency
}

export function createTelegramMessageHandler({
  convertCurrency,
}: TelegramMessageHandlerOptions): HandleTelegramMessage {
  return async (update) => {
    const message = update.message

    if (!message || message.chat?.type !== 'private' || typeof message.chat.id !== 'number') {
      return
    }

    if (typeof message.text !== 'string') {
      return createSendMessageAction(message.chat.id, formatHelpMessage())
    }

    const parsedInput = parseTelegramInput(message.text)

    if (parsedInput.kind === 'command') {
      const response = parsedInput.command === 'start'
        ? formatStartMessage()
        : formatHelpMessage()
      return createSendMessageAction(message.chat.id, response)
    }

    if (parsedInput.kind === 'error') {
      return createSendMessageAction(
        message.chat.id,
        formatParseError(parsedInput.reason, parsedInput.currencies),
      )
    }

    const { conversion } = parsedInput

    try {
      const result = await convertCurrency(conversion)

      return createSendMessageAction(
        message.chat.id,
        formatConversionResult(result),
        createPeriodKeyboard(result),
      )
    } catch (error) {
      if (isUnsupportedCurrencyError(error)) {
        return createSendMessageAction(
          message.chat.id,
          formatUnsupportedCurrency(error.currencies),
        )
      }

      if (isAllProvidersFailedError(error)) {
        return createSendMessageAction(
          message.chat.id,
          isUnsupportedCurrencyError(error.fallbackError)
            ? formatFallbackUnavailable(conversion.base, conversion.quote)
            : formatServiceUnavailable(),
        )
      }

      return createSendMessageAction(
        message.chat.id,
        formatServiceUnavailable(),
      )
    }
  }
}
