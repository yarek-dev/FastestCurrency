import { describe, expect, it } from 'vitest'

import type { ConversionResult } from '../../../../src/domain/currency.js'
import {
  createPeriodCallbackData,
  createPeriodKeyboard,
  parsePeriodCallbackData,
} from '../../../../src/presentation/telegram/input/telegram-callback-data.js'

const result: ConversionResult = {
  amount: 1,
  base: 'BTC',
  quote: 'USD',
  rate: 80_751.123456,
  convertedAmount: 80_751.123456,
  previousRate: 78_850,
  changePercent: 2.4,
  provider: 'currency-beacon',
}

describe('Telegram period callback data', () => {
  it('keeps callback data readable and round-trips every supported period', () => {
    expect(createPeriodKeyboard(result)).toEqual({
      inline_keyboard: [[3, 7, 14, 30].map((days) => ({
        text: `${days} дн.`,
        callback_data: `change|BTC|USD|80751.123456|currency-beacon|${days}`,
      }))],
    })

    expect(parsePeriodCallbackData(
      createPeriodCallbackData(result, 14),
    )).toEqual({
      base: 'BTC',
      quote: 'USD',
      currentRate: 80_751.123456,
      provider: 'currency-beacon',
      days: 14,
    })
  })

  it.each([
    'change|BTC|USD|0|currency-beacon|7',
    'change|BTC|USD|80751|unknown|7',
    'change|BTC|USD|80751|currency-beacon|5',
    'change|btc|USD|80751|currency-beacon|7',
    'change|BTC|USD|80751|currency-beacon|7|extra',
  ])('rejects invalid callback data: %s', (data) => {
    expect(parsePeriodCallbackData(data)).toBeUndefined()
  })

  it('omits the keyboard when readable callback data exceeds 64 bytes', () => {
    expect(createPeriodKeyboard({
      ...result,
      base: 'ABCDEFGHIJKLMNOPQRST',
      quote: 'QRSTUVWXYZABCDEFGHIJ',
    })).toBeUndefined()
  })
})
