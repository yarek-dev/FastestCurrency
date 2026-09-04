import { describe, expect, it, vi } from 'vitest'

import type { ConvertCurrency } from '../../../../src/application/use-cases/convert-currency.js'
import type { ConversionResult } from '../../../../src/domain/currency.js'
import {
  createAllProvidersFailedError,
  createUnsupportedCurrencyError,
} from '../../../../src/domain/errors.js'
import {
  formatConversionResult,
  formatFallbackUnavailable,
  formatHelpMessage,
  formatParseError,
  formatServiceUnavailable,
  formatStartMessage,
  formatUnsupportedCurrency,
} from '../../../../src/presentation/telegram/telegram-message-formatter.js'
import { createTelegramUpdateHandler } from '../../../../src/presentation/telegram/telegram-update-handler.js'
import type { TelegramUpdate } from '../../../../src/presentation/telegram/telegram-types.js'
import { createLoggerSpy } from '../../../support/logger-spy.js'

const conversionResult: ConversionResult = {
  amount: 100,
  base: 'EUR',
  quote: 'USD',
  rate: 1.1,
  convertedAmount: 110,
  provider: 'frankfurter',
}

function privateUpdate(text?: string): TelegramUpdate {
  return {
    update_id: 42,
    message: {
      chat: { id: 123, type: 'private' },
      ...(text === undefined ? {} : { text }),
    },
  }
}

function action(text: string) {
  return { method: 'sendMessage' as const, chat_id: 123, text }
}

describe('createTelegramUpdateHandler', () => {
  it.each([
    {},
    { message: { chat: { id: 123, type: 'group' }, text: 'EUR USD' } },
    { message: { chat: { type: 'private' }, text: 'EUR USD' } },
  ] satisfies TelegramUpdate[])('ignores an update that is not a private chat message', async (update) => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger: createLoggerSpy() })

    await expect(handler(update)).resolves.toBeUndefined()
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it('returns help for a private non-text message', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger: createLoggerSpy() })

    await expect(handler(privateUpdate())).resolves.toEqual(action(formatHelpMessage()))
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it.each([
    ['/start', formatStartMessage()],
    ['/help', formatHelpMessage()],
  ])('handles the %s command without converting', async (text, response) => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger: createLoggerSpy() })

    await expect(handler(privateUpdate(text))).resolves.toEqual(action(response))
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it('returns a parse error without calling the use case', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger: createLoggerSpy() })

    await expect(handler(privateUpdate('---'))).resolves.toEqual(
      action(formatParseError('missing-currency')),
    )
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it('converts a parsed request and logs the completed operation', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>().mockResolvedValue(conversionResult)
    const logger = createLoggerSpy()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger })

    await expect(handler(privateUpdate('100 eur usd'))).resolves.toEqual(
      action(formatConversionResult(conversionResult)),
    )
    expect(convertCurrency).toHaveBeenCalledOnce()
    expect(convertCurrency).toHaveBeenCalledWith({ amount: 100, base: 'EUR', quote: 'USD' })
    expect(logger.info).toHaveBeenCalledWith({
      updateId: 42,
      chatId: 123,
      amount: 100,
      base: 'EUR',
      quote: 'USD',
      provider: 'frankfurter',
    }, 'Currency conversion completed')
  })

  it('returns a specific message for an unsupported currency', async () => {
    const unsupported = createUnsupportedCurrencyError(['ZZZ'])
    const convertCurrency = vi.fn<ConvertCurrency>().mockRejectedValue(unsupported)
    const logger = createLoggerSpy()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger })

    await expect(handler(privateUpdate('ZZZ USD'))).resolves.toEqual(
      action(formatUnsupportedCurrency(['ZZZ'])),
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('returns fallback-specific guidance when only fallback lacks the currency', async () => {
    const allFailed = createAllProvidersFailedError(
      new Error('primary offline'),
      createUnsupportedCurrencyError(['BTC']),
    )
    const convertCurrency = vi.fn<ConvertCurrency>().mockRejectedValue(allFailed)
    const logger = createLoggerSpy()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger })

    await expect(handler(privateUpdate('BTC USD'))).resolves.toEqual(
      action(formatFallbackUnavailable('BTC', 'USD')),
    )
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      updateId: 42,
      chatId: 123,
      primaryError: 'primary offline',
      fallbackError: 'Unsupported currency: BTC',
    }), 'All currency providers failed')
  })

  it('returns service unavailable when both providers fail operationally', async () => {
    const allFailed = createAllProvidersFailedError(
      new Error('primary offline'),
      new Error('fallback offline'),
    )
    const convertCurrency = vi.fn<ConvertCurrency>().mockRejectedValue(allFailed)
    const logger = createLoggerSpy()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger })

    await expect(handler(privateUpdate('EUR USD'))).resolves.toEqual(
      action(formatServiceUnavailable()),
    )
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      primaryError: 'primary offline',
      fallbackError: 'fallback offline',
    }), 'All currency providers failed')
  })

  it('normalizes an unknown failure, logs it, and hides its details from the user', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>().mockRejectedValue('secret failure detail')
    const logger = createLoggerSpy()
    const handler = createTelegramUpdateHandler({ convertCurrency, logger })

    await expect(handler(privateUpdate('EUR USD'))).resolves.toEqual(
      action(formatServiceUnavailable()),
    )
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      errorName: 'Error',
      errorMessage: 'Unknown conversion error',
    }), 'Currency conversion failed')
  })
})
