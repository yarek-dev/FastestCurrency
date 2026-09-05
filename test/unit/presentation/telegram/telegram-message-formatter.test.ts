import { describe, expect, it } from 'vitest'

import type {
  ConversionResult,
  PeriodChangeResult,
} from '../../../../src/domain/currency.js'
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

describe('telegram message formatter', () => {
  it('returns stable help and start messages', () => {
    const help = `Привет! 👋 Я помогу узнать курс валют и криптовалют, пересчитать сумму и посмотреть, как изменился курс.

Отправь запрос, например:
💵 EUR — курс евро к доллару
🪙 BTC EUR — курс биткоина к евро
💱 100 USDT USD — сколько будет 100 USDT в долларах

В ответе покажу курс и сравнение со вчерашним значением. Кнопки под ответом покажут изменение за 3, 7, 14 или 30 дней.`

    expect(formatHelpMessage()).toBe(help)
    expect(formatStartMessage()).toBe(help)
  })

  it.each([
    ['invalid-amount', undefined, 'Некорректная сумма. Используй положительное число не больше 1000000000000, до 8 знаков после запятой и без разделителей тысяч.'],
    ['multiple-amounts', undefined, 'Укажи только одну сумму, например: 100 EUR USD.'],
    ['too-many-currencies', ['EUR', 'USD', 'GBP'], 'Я нашёл несколько валют: EUR, USD, GBP. Укажи не более двух кодов, например: 100 EUR USD.'],
    ['missing-currency', undefined, `Не нашёл код валюты.\n\n${formatHelpMessage()}`],
  ] as const)('formats the %s parse error', (reason, currencies, expected) => {
    expect(formatParseError(reason, currencies ? [...currencies] : undefined)).toBe(expected)
  })

  it('formats a one-unit Frankfurter result without a redundant rate line', () => {
    expect(formatConversionResult(result())).toBe(
      '🔄 EUR → USD\n\n🪙 1 EUR = 1.1 USD  ▲ +10%\n📈 (вчера: 1 USD)\n\n📊 Frankfurter, дневной справочный курс\n\n📊 Изменение курса за:',
    )
  })

  it('rounds a regular result and includes the unit rate', () => {
    expect(formatConversionResult(result({
      amount: 2.5,
      rate: 1.2345678,
      convertedAmount: 3.0864195,
      provider: 'currency-beacon',
    }))).toBe(
      '🔄 EUR → USD\n\n🪙 2.5 EUR = 3.09 USD\n💱 1 EUR = 1.234568 USD  ▲ +10%\n📈 (вчера: 1 USD)\n\n📊 CurrencyBeacon\n\n📊 Изменение курса за:',
    )
  })

  it('formats the daily comparison with grouped values', () => {
    expect(formatConversionResult(result({
      base: 'BTC',
      rate: 80_751,
      previousRate: 78_850,
      convertedAmount: 80_751,
      changePercent: 2.4109,
      provider: 'currency-beacon',
    }))).toContain(
      '🪙 1 BTC = 80 751 USD  ▲ +2.4%\n📈 (вчера: 78 850 USD)',
    )
  })

  it('formats a period change as a standalone message', () => {
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

    expect(formatPeriodChangeResult(periodResult)).toBe(
      '🔄 BTC → USD\n\n🪙 1 BTC = 80 751 USD\n📈 (7 дней назад: 78 000 USD)\nИзменение за 7 дней: ▲ +3.5%\n\n🕘 04.09.2026, 17:12 UTC\n📊 CurrencyBeacon',
    )
  })

  it.each([
    [0.01, '• 0%'],
    [-0.01, '• 0%'],
    [0.04, '• 0%'],
    [0.05, '▲ +0.1%'],
    [-0.05, '• 0%'],
  ])('chooses the indicator after rounding a %s%% change', (changePercent, indicator) => {
    const message = formatConversionResult(result({ changePercent }))

    expect(message).toContain(`1 EUR = 1.1 USD  ${indicator}`)
    expect(message).not.toMatch(/[▲▼] [+-]?0%/)
  })

  it('keeps rate precision for a one-unit request', () => {
    expect(formatConversionResult(result({
      rate: 1.2345678,
      convertedAmount: 1.2345678,
    }))).toContain('🪙 1 EUR = 1.234568 USD')
  })

  it('keeps useful precision for a converted amount below one', () => {
    expect(formatConversionResult(result({
      amount: 0.00001,
      rate: 1.234,
      convertedAmount: 0.00001234,
    }))).toContain('🪙 0.00001 EUR = 0.00001234 USD')
  })

  it('formats the minimum supported input amount without rounding it to zero', () => {
    expect(formatConversionResult(result({
      amount: 0.00000001,
      rate: 1,
      convertedAmount: 0.00000001,
    }))).toContain('🪙 0.00000001 EUR = 0.00000001 USD')
  })

  it('uses scientific notation when the converted amount and rate are very small', () => {
    expect(formatConversionResult(result({
      amount: 2,
      rate: 0.000000001234,
      convertedAmount: 0.000000002468,
    }))).toContain(
      '🪙 2 EUR = 2.468e-9 USD\n💱 1 EUR = 1.234e-9 USD',
    )
  })

  it('formats a provider date', () => {
    expect(formatConversionResult(result({
      observedAt: { kind: 'date', value: '2026-09-04' },
    }))).toContain('🕘 04.09.2026')
  })

  it('formats a timestamp in UTC rather than the local timezone', () => {
    expect(formatConversionResult(result({
      provider: 'currency-beacon',
      observedAt: { kind: 'timestamp', value: '2026-09-04T23:07:00+03:00' },
    }))).toContain('🕘 04.09.2026, 20:07 UTC')
  })

  it('omits an invalid timestamp', () => {
    const message = formatConversionResult(result({
      observedAt: { kind: 'timestamp', value: 'not-a-date' },
    }))

    expect(message).not.toContain('🕘')
    expect(message).toBe(
      '🔄 EUR → USD\n\n🪙 1 EUR = 1.1 USD  ▲ +10%\n📈 (вчера: 1 USD)\n\n📊 Frankfurter, дневной справочный курс\n\n📊 Изменение курса за:',
    )
  })

  it('formats and deduplicates unsupported currencies', () => {
    expect(formatUnsupportedCurrency(['ZZZ', 'ZZZ'])).toBe(
      'Валюта ZZZ не найдена или не поддерживается.',
    )
    expect(formatUnsupportedCurrency(['AAA', 'BBB', 'AAA'])).toBe(
      'Одна из валют AAA/BBB не найдена или не поддерживается.',
    )
  })

  it('returns stable provider failure messages', () => {
    expect(formatFallbackUnavailable('EUR', 'USD')).toBe(
      'Сейчас не удалось получить курс для EUR/USD. Валюта может быть недоступна в резервном источнике. Попробуй позже.',
    )
    expect(formatServiceUnavailable()).toBe(
      'Не удалось получить курс валют. Попробуй немного позже.',
    )
  })
})
