import type { Logger } from '../../../application/ports/logger.js'
import type { ConvertCurrency } from '../../../application/use-cases/convert-currency.js'
import {
  isAllProvidersFailedError,
  isUnsupportedCurrencyError,
} from '../../../domain/errors.js'
import { toError } from '../../../shared/errors.js'
import { createSendMessageAction } from '../telegram-actions.js'
import { createPeriodKeyboard } from '../input/telegram-callback-data.js'
import { formatConversionResult } from '../messages/telegram-result-formatter.js'
import {
  formatFallbackUnavailable,
  formatHelpMessage,
  formatParseError,
  formatServiceUnavailable,
  formatStartMessage,
  formatUnsupportedCurrency,
} from '../messages/telegram-static-messages.js'
import { parseTelegramInput } from '../input/telegram-update-parser.js'
import type { TelegramUpdate, TelegramWebhookAction } from '../telegram-types.js'

export type HandleTelegramMessage = (
  update: TelegramUpdate,
) => Promise<TelegramWebhookAction | undefined>

export interface TelegramMessageHandlerOptions {
  convertCurrency: ConvertCurrency
  logger: Logger
}

export function createTelegramMessageHandler({
  convertCurrency,
  logger,
}: TelegramMessageHandlerOptions): HandleTelegramMessage {
  return async (update) => {
    const message = update.message

    if (!message || message.chat?.type !== 'private' || typeof message.chat.id !== 'number') {
      return
    }

    const context = {
      updateId: update.update_id,
      chatId: message.chat.id,
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
    const conversionContext = {
      ...context,
      amount: conversion.amount,
      base: conversion.base,
      quote: conversion.quote,
    }

    try {
      const result = await convertCurrency(conversion)

      logger.info({
        ...conversionContext,
        provider: result.provider,
      }, 'Currency conversion completed')

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
        logger.error({
          ...conversionContext,
          primaryError: error.primaryError.message,
          fallbackError: error.fallbackError.message,
        }, 'All currency providers failed')

        return createSendMessageAction(
          message.chat.id,
          isUnsupportedCurrencyError(error.fallbackError)
            ? formatFallbackUnavailable(conversion.base, conversion.quote)
            : formatServiceUnavailable(),
        )
      }

      const normalizedError = toError(error, 'Unknown conversion error')
      logger.error({
        ...conversionContext,
        errorName: normalizedError.name,
        errorMessage: normalizedError.message,
      }, 'Currency conversion failed')

      return createSendMessageAction(
        message.chat.id,
        formatServiceUnavailable(),
      )
    }
  }
}
