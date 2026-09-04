import { describe, expect, it } from 'vitest'

import type { ConversionResult } from '../../../../src/domain/currency.js'
import {
  formatConversionResult,
  formatFallbackUnavailable,
  formatHelpMessage,
  formatParseError,
  formatServiceUnavailable,
  formatStartMessage,
  formatUnsupportedCurrency,
} from '../../../../src/presentation/telegram/telegram-message-formatter.js'

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
    const help = `Отправь код валюты, криптовалюты или валютную пару.

Примеры:
EUR
BTC USD
100 USDT USD`

    expect(formatHelpMessage()).toBe(help)
    expect(formatStartMessage()).toBe(`Привет! Я конвертирую валюты.\n\n${help}`)
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
      '🔄 EUR → USD\n\n🪙 1 EUR = 1.1 USD  ▲ +10%\n(вчера: 1 USD)\n\n📊 Frankfurter, дневной справочный курс',
    )
  })

  it('rounds a regular result and includes the unit rate', () => {
    expect(formatConversionResult(result({
      amount: 2.5,
      rate: 1.2345678,
      convertedAmount: 3.0864195,
      provider: 'currency-beacon',
    }))).toBe(
      '🔄 EUR → USD\n\n🪙 2.5 EUR = 3.09 USD\n💱 1 EUR = 1.234568 USD  ▲ +10%\n(вчера: 1 USD)\n\n📊 CurrencyBeacon',
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
      '🪙 1 BTC = 80 751 USD  ▲ +2.4%\n(вчера: 78 850 USD)',
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
      '🔄 EUR → USD\n\n🪙 1 EUR = 1.1 USD  ▲ +10%\n(вчера: 1 USD)\n\n📊 Frankfurter, дневной справочный курс',
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
