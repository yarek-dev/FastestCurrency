import {
  deepStrictEqual,
  strictEqual,
} from 'node:assert/strict'

import type { ConvertCurrency } from '../../../functions/telegram-webhook/application/use-cases/convert-currency.ts'
import type { GetPeriodChange } from '../../../functions/telegram-webhook/application/use-cases/get-period-change.ts'
import type {
  PeriodChangeRequest,
  PeriodChangeResult,
} from '../../../functions/telegram-webhook/domain/currency.ts'
import { createTelegramUpdateHandler } from '../../../functions/telegram-webhook/presentation/telegram/handlers/telegram-update-handler.ts'
import { formatPeriodChangeResult } from '../../../functions/telegram-webhook/presentation/telegram/messages/telegram-result-formatter.ts'
import type { TelegramUpdate } from '../../../functions/telegram-webhook/presentation/telegram/telegram-types.ts'

const unusedConvertCurrency: ConvertCurrency = () => Promise.reject(
  new Error('should not be called'),
)

Deno.test('answers a period callback and returns a separate permanent message', async () => {
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
  let receivedCallbackQueryId: string | undefined
  let receivedPeriodInput: PeriodChangeRequest | undefined
  const answerCallbackQuery = (id: string) => {
    receivedCallbackQueryId = id
    return Promise.resolve()
  }
  const getPeriodChange: GetPeriodChange = (input) => {
    receivedPeriodInput = input
    return Promise.resolve(periodResult)
  }
  const handler = createTelegramUpdateHandler({
    answerCallbackQuery,
    convertCurrency: unusedConvertCurrency,
    getPeriodChange,
  })
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

  const action = await handler(update)

  deepStrictEqual(action, {
    method: 'sendMessage',
    chat_id: 123,
    text: formatPeriodChangeResult(periodResult),
  })
  strictEqual(receivedCallbackQueryId, 'callback-1')
  deepStrictEqual(receivedPeriodInput, {
    base: 'BTC',
    quote: 'USD',
    currentRate: 80_751,
    provider: 'currency-beacon',
    days: 7,
    referenceDate: new Date(1_778_000_000_000),
  })
})

Deno.test('acknowledges and ignores invalid callback data', async () => {
  let receivedCallbackQueryId: string | undefined
  let getPeriodChangeCalled = false
  const handler = createTelegramUpdateHandler({
    answerCallbackQuery: (id) => {
      receivedCallbackQueryId = id
      return Promise.resolve()
    },
    convertCurrency: unusedConvertCurrency,
    getPeriodChange: () => {
      getPeriodChangeCalled = true
      return Promise.reject(new Error('should not be called'))
    },
  })

  const action = await handler({
    callback_query: {
      id: 'callback-2',
      data: 'invalid',
      message: { chat: { id: 123, type: 'private' } },
    },
  })

  strictEqual(action, undefined)
  strictEqual(receivedCallbackQueryId, 'callback-2')
  strictEqual(getPeriodChangeCalled, false)
})
