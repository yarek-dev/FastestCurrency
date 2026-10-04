import {
  match,
  strictEqual,
} from 'node:assert/strict'

import type {
  ConversionResult,
  PeriodChangeResult,
} from '../../../functions/telegram-webhook/domain/currency.ts'
import {
  formatConversionResult,
  formatFallbackUnavailable,
  formatHelpMessage,
  formatParseError,
  formatPeriodChangeResult,
  formatServiceUnavailable,
  formatStartMessage,
  formatUnsupportedCurrency,
} from '../../../functions/telegram-webhook/presentation/telegram/messages/telegram-message-formatter.ts'

function result(overrides: Partial<ConversionResult> = {}): ConversionResult {
  return {
    amount: 1,
    base: 'EUR',
    quote: 'USD',
    rate: 1.1,
    previousRate: 1,
    changePercent: 10,
    convertedAmount: 1.1,
    provider: 'frankfurter',
    ...overrides,
  }
}

Deno.test('returns stable help and start messages', () => {
  const help = `Привет! 👋 Я помогу узнать курс валют и криптовалют, пересчитать сумму и посмотреть, как изменился курс.

Отправь запрос, например:
💵 EUR — курс евро к доллару
🪙 BTC EUR — курс биткоина к евро
💱 100 USDT USD — сколько будет 100 USDT в долларах

В ответе покажу курс и сравнение со вчерашним значением. Кнопки под ответом покажут изменение за 3, 7, 14 или 30 дней.`

  strictEqual(formatHelpMessage(), help)
  strictEqual(formatStartMessage(), help)
})

const parseErrorCases = [
  ['invalid-amount', undefined, 'Некорректная сумма. Используй положительное число не больше 1000000000000, до 8 знаков после запятой и без разделителей тысяч.'],
  ['multiple-amounts', undefined, 'Укажи только одну сумму, например: 100 EUR USD.'],
  ['too-many-currencies', ['EUR', 'USD', 'GBP'], 'Я нашёл несколько валют: EUR, USD, GBP. Укажи не более двух кодов, например: 100 EUR USD.'],
  ['missing-currency', undefined, `Не нашёл код валюты.\n\n${formatHelpMessage()}`],
] as const

for (const [reason, currencies, expected] of parseErrorCases) {
  Deno.test(`formats the ${reason} parse error`, () => {
    strictEqual(
      formatParseError(reason, currencies ? [...currencies] : undefined),
      expected,
    )
  })
}

Deno.test('formats a one-unit Frankfurter result without a redundant rate line', () => {
  strictEqual(
    formatConversionResult(result()),
    '🔄 EUR → USD\n\n🪙 1 EUR = 1.1 USD  ▲ +10%\n📈 (вчера: 1 USD)\n\n📊 Frankfurter, дневной справочный курс\n\n📊 Изменение курса за:',
  )
})

Deno.test('rounds a regular result and includes the unit rate', () => {
  strictEqual(
    formatConversionResult(result({
      amount: 2.5,
      rate: 1.2345678,
      convertedAmount: 3.0864195,
      provider: 'currency-beacon',
    })),
    '🔄 EUR → USD\n\n🪙 2.5 EUR = 3.09 USD\n💱 1 EUR = 1.234568 USD  ▲ +10%\n📈 (вчера: 1 USD)\n\n📊 CurrencyBeacon\n\n📊 Изменение курса за:',
  )
})

Deno.test('formats the daily comparison with grouped values', () => {
  match(
    formatConversionResult(result({
      base: 'BTC',
      rate: 80_751,
      previousRate: 78_850,
      convertedAmount: 80_751,
      changePercent: 2.4109,
      provider: 'currency-beacon',
    })),
    /🪙 1 BTC = 80 751 USD  ▲ \+2\.4%\n📈 \(вчера: 78 850 USD\)/,
  )
})

Deno.test('formats a period change as a standalone message', () => {
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

  strictEqual(
    formatPeriodChangeResult(periodResult),
    '🔄 BTC → USD\n\n🪙 1 BTC = 80 751 USD\n📈 (7 дней назад: 78 000 USD)\nИзменение за 7 дней: ▲ +3.5%\n\n🕘 04.09.2026, 17:12 UTC\n📊 CurrencyBeacon',
  )
})

for (const [changePercent, indicator] of [
  [0.01, '• 0%'],
  [-0.01, '• 0%'],
  [0.04, '• 0%'],
  [0.05, '▲ +0.1%'],
  [-0.05, '• 0%'],
] as const) {
  Deno.test(`chooses the indicator after rounding a ${changePercent}% change`, () => {
    const message = formatConversionResult(result({ changePercent }))

    match(message, new RegExp(indicator === '▲ +0.1%'
      ? '1 EUR = 1\\.1 USD  ▲ \\+0\\.1%'
      : '1 EUR = 1\\.1 USD  • 0%'))
    strictEqual(/[▲▼] [+-]?0%/.test(message), false)
  })
}

Deno.test('keeps rate precision for a one-unit request', () => {
  match(
    formatConversionResult(result({
      rate: 1.2345678,
      convertedAmount: 1.2345678,
    })),
    /🪙 1 EUR = 1\.234568 USD/,
  )
})

Deno.test('keeps useful precision for a converted amount below one', () => {
  match(
    formatConversionResult(result({
      amount: 0.00001,
      rate: 1.234,
      convertedAmount: 0.00001234,
    })),
    /🪙 0\.00001 EUR = 0\.00001234 USD/,
  )
})

Deno.test('formats the minimum supported input amount without rounding it to zero', () => {
  match(
    formatConversionResult(result({
      amount: 0.00000001,
      rate: 1,
      convertedAmount: 0.00000001,
    })),
    /🪙 0\.00000001 EUR = 0\.00000001 USD/,
  )
})

Deno.test('uses scientific notation when the converted amount and rate are very small', () => {
  match(
    formatConversionResult(result({
      amount: 2,
      rate: 0.000000001234,
      convertedAmount: 0.000000002468,
    })),
    /🪙 2 EUR = 2\.468e-9 USD\n💱 1 EUR = 1\.234e-9 USD/,
  )
})

Deno.test('formats a provider date', () => {
  match(
    formatConversionResult(result({
      observedAt: { kind: 'date', value: '2026-09-04' },
    })),
    /🕘 04\.09\.2026/,
  )
})

Deno.test('formats a timestamp in UTC rather than the local timezone', () => {
  match(
    formatConversionResult(result({
      provider: 'currency-beacon',
      observedAt: { kind: 'timestamp', value: '2026-09-04T23:07:00+03:00' },
    })),
    /🕘 04\.09\.2026, 20:07 UTC/,
  )
})

Deno.test('omits an invalid timestamp', () => {
  const message = formatConversionResult(result({
    observedAt: { kind: 'timestamp', value: 'not-a-date' },
  }))

  strictEqual(message.includes('🕘'), false)
  strictEqual(
    message,
    '🔄 EUR → USD\n\n🪙 1 EUR = 1.1 USD  ▲ +10%\n📈 (вчера: 1 USD)\n\n📊 Frankfurter, дневной справочный курс\n\n📊 Изменение курса за:',
  )
})

Deno.test('formats and deduplicates unsupported currencies', () => {
  strictEqual(
    formatUnsupportedCurrency(['ZZZ', 'ZZZ']),
    'Валюта ZZZ не найдена или не поддерживается.',
  )
  strictEqual(
    formatUnsupportedCurrency(['AAA', 'BBB', 'AAA']),
    'Одна из валют AAA/BBB не найдена или не поддерживается.',
  )
})

Deno.test('returns stable provider failure messages', () => {
  strictEqual(
    formatFallbackUnavailable('EUR', 'USD'),
    'Сейчас не удалось получить курс для EUR/USD. Валюта может быть недоступна в резервном источнике. Попробуй позже.',
  )
  strictEqual(
    formatServiceUnavailable(),
    'Не удалось получить курс валют. Попробуй немного позже.',
  )
})
