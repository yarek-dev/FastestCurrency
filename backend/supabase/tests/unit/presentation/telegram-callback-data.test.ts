import {
  deepStrictEqual,
  strictEqual,
} from 'node:assert/strict'

import type { ConversionResult } from '../../../functions/telegram-webhook/domain/currency.ts'
import {
  createPeriodCallbackData,
  createPeriodKeyboard,
  parsePeriodCallbackData,
} from '../../../functions/telegram-webhook/presentation/telegram/input/telegram-callback-data.ts'

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

Deno.test('keeps callback data readable and round-trips every supported period', () => {
  deepStrictEqual(createPeriodKeyboard(result), {
    inline_keyboard: [[3, 7, 14, 30].map((days) => ({
      text: `${days} дн.`,
      callback_data: `change|BTC|USD|80751.123456|currency-beacon|${days}`,
    }))],
  })

  deepStrictEqual(
    parsePeriodCallbackData(createPeriodCallbackData(result, 14)),
    {
      base: 'BTC',
      quote: 'USD',
      currentRate: 80_751.123456,
      provider: 'currency-beacon',
      days: 14,
    },
  )
})

for (const data of [
  'change|BTC|USD|0|currency-beacon|7',
  'change|BTC|USD|80751|unknown|7',
  'change|BTC|USD|80751|currency-beacon|5',
  'change|btc|USD|80751|currency-beacon|7',
  'change|BTC|USD|80751|currency-beacon|7|extra',
]) {
  Deno.test(`rejects invalid callback data: ${data}`, () => {
    strictEqual(parsePeriodCallbackData(data), undefined)
  })
}

Deno.test('omits the keyboard when readable callback data exceeds 64 bytes', () => {
  strictEqual(createPeriodKeyboard({
    ...result,
    base: 'ABCDEFGHIJKLMNOPQRST',
    quote: 'QRSTUVWXYZABCDEFGHIJ',
  }), undefined)
})
