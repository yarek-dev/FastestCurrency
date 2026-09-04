import { describe, expect, it, vi } from 'vitest'

import type { ConvertCurrency } from '../../../../src/application/use-cases/convert-currency.js'
import type { GetPeriodChange } from '../../../../src/application/use-cases/get-period-change.js'
import type {
  ConversionResult,
  PeriodChangeResult,
} from '../../../../src/domain/currency.js'
import {
  createAllProvidersFailedError,
  createUnsupportedCurrencyError,
} from '../../../../src/domain/errors.js'
import {
  formatConversionResult,
  formatFallbackUnavailable,
  formatHelpMessage,
  formatParseError,
  formatPeriodChangeResult,
  formatServiceUnavailable,
  formatStartMessage,
  formatUnsupportedCurrency,
} from '../../../../src/presentation/telegram/messages/telegram-message-formatter.js'
import { createTelegramUpdateHandler } from '../../../../src/presentation/telegram/index.js'
import type { TelegramUpdate } from '../../../../src/presentation/telegram/telegram-types.js'
import { createLoggerSpy } from '../../../support/logger-spy.js'

const conversionResult: ConversionResult = {
  amount: 100,
  base: 'EUR',
  quote: 'USD',
  rate: 1.1,
  previousRate: 1,
  changePercent: 10,
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

function createHandler(
  convertCurrency: ConvertCurrency,
  logger = createLoggerSpy(),
  getPeriodChange = vi.fn<GetPeriodChange>(),
  answerCallbackQuery = vi.fn<(callbackQueryId: string) => Promise<void>>()
    .mockResolvedValue(undefined),
) {
  return createTelegramUpdateHandler({
    answerCallbackQuery,
    convertCurrency,
    getPeriodChange,
    logger,
  })
}

describe('createTelegramUpdateHandler', () => {
  it.each([
    {},
    { message: { chat: { id: 123, type: 'group' }, text: 'EUR USD' } },
    { message: { chat: { type: 'private' }, text: 'EUR USD' } },
  ] satisfies TelegramUpdate[])('ignores an update that is not a private chat message', async (update) => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createHandler(convertCurrency)

    await expect(handler(update)).resolves.toBeUndefined()
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it('returns help for a private non-text message', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createHandler(convertCurrency)

    await expect(handler(privateUpdate())).resolves.toEqual(action(formatHelpMessage()))
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it.each([
    ['/start', formatStartMessage()],
    ['/help', formatHelpMessage()],
  ])('handles the %s command without converting', async (text, response) => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createHandler(convertCurrency)

    await expect(handler(privateUpdate(text))).resolves.toEqual(action(response))
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it('returns a parse error without calling the use case', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>()
    const handler = createHandler(convertCurrency)

    await expect(handler(privateUpdate('---'))).resolves.toEqual(
      action(formatParseError('missing-currency')),
    )
    expect(convertCurrency).not.toHaveBeenCalled()
  })

  it('converts a parsed request and logs the completed operation', async () => {
    const convertCurrency = vi.fn<ConvertCurrency>().mockResolvedValue(conversionResult)
    const logger = createLoggerSpy()
    const handler = createHandler(convertCurrency, logger)

    await expect(handler(privateUpdate('100 eur usd'))).resolves.toEqual({
      ...action(formatConversionResult(conversionResult)),
      reply_markup: {
        inline_keyboard: [[
          { text: '3 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|3' },
          { text: '7 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|7' },
          { text: '14 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|14' },
          { text: '30 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|30' },
        ]],
      },
    })
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
    const handler = createHandler(convertCurrency, logger)

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
    const handler = createHandler(convertCurrency, logger)

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
    const handler = createHandler(convertCurrency, logger)

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
    const handler = createHandler(convertCurrency, logger)

    await expect(handler(privateUpdate('EUR USD'))).resolves.toEqual(
      action(formatServiceUnavailable()),
    )
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      errorName: 'Error',
      errorMessage: 'Unknown conversion error',
    }), 'Currency conversion failed')
  })

  it('answers a period callback and returns a separate permanent message', async () => {
    const periodResult: PeriodChangeResult = {
      base: 'BTC',
      quote: 'USD',
      currentRate: 80_751,
      historicalRate: 78_000,
      changePercent: 3.527,
      provider: 'currency-beacon',
      days: 7,
      referenceDate: new Date('2026-09-04T17:12:00.000Z'),
    }
    const getPeriodChange = vi.fn<GetPeriodChange>().mockResolvedValue(periodResult)
    const answerCallbackQuery = vi.fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    const logger = createLoggerSpy()
    const handler = createHandler(
      vi.fn<ConvertCurrency>(),
      logger,
      getPeriodChange,
      answerCallbackQuery,
    )

    const update: TelegramUpdate = {
      update_id: 50,
      callback_query: {
        id: 'callback-1',
        data: 'change|BTC|USD|80751|currency-beacon|7',
        message: {
          date: 1_778_000_000,
          chat: { id: 123, type: 'private' },
        },
      },
    }

    await expect(handler(update)).resolves.toEqual(
      action(formatPeriodChangeResult(periodResult)),
    )
    expect(answerCallbackQuery).toHaveBeenCalledWith('callback-1')
    expect(getPeriodChange).toHaveBeenCalledWith({
      base: 'BTC',
      quote: 'USD',
      currentRate: 80_751,
      provider: 'currency-beacon',
      days: 7,
      referenceDate: new Date(1_778_000_000_000),
    })
    expect(logger.info).toHaveBeenCalledWith({
      updateId: 50,
      chatId: 123,
      base: 'BTC',
      quote: 'USD',
      provider: 'currency-beacon',
      days: 7,
    }, 'Currency period change completed')
  })

  it('acknowledges and ignores invalid callback data', async () => {
    const getPeriodChange = vi.fn<GetPeriodChange>()
    const answerCallbackQuery = vi.fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    const handler = createHandler(
      vi.fn<ConvertCurrency>(),
      createLoggerSpy(),
      getPeriodChange,
      answerCallbackQuery,
    )

    await expect(handler({
      callback_query: {
        id: 'callback-2',
        data: 'invalid',
        message: { chat: { id: 123, type: 'private' } },
      },
    })).resolves.toBeUndefined()
    expect(answerCallbackQuery).toHaveBeenCalledWith('callback-2')
    expect(getPeriodChange).not.toHaveBeenCalled()
  })
})
