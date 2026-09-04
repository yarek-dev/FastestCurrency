import type { ParseErrorReason } from '../input/telegram-input.js'

const HELP_MESSAGE = `Отправь код валюты, криптовалюты или валютную пару.

Примеры:
EUR
BTC USD
100 USDT USD`

export function formatHelpMessage(): string {
  return HELP_MESSAGE
}

export function formatStartMessage(): string {
  return `Привет! Я конвертирую валюты.

${HELP_MESSAGE}`
}

export function formatParseError(reason: ParseErrorReason, currencies?: string[]): string {
  switch (reason) {
    case 'invalid-amount':
      return 'Некорректная сумма. Используй положительное число не больше 1000000000000, до 8 знаков после запятой и без разделителей тысяч.'
    case 'multiple-amounts':
      return 'Укажи только одну сумму, например: 100 EUR USD.'
    case 'too-many-currencies':
      return `Я нашёл несколько валют: ${currencies?.join(', ') ?? ''}. Укажи не более двух кодов, например: 100 EUR USD.`
    case 'missing-currency':
      return `Не нашёл код валюты.

${HELP_MESSAGE}`
  }
}

export function formatUnsupportedCurrency(currencies: string[]): string {
  const uniqueCurrencies = [...new Set(currencies)]

  return uniqueCurrencies.length === 1
    ? `Валюта ${uniqueCurrencies[0]} не найдена или не поддерживается.`
    : `Одна из валют ${uniqueCurrencies.join('/')} не найдена или не поддерживается.`
}

export function formatFallbackUnavailable(base: string, quote: string): string {
  return `Сейчас не удалось получить курс для ${base}/${quote}. Валюта может быть недоступна в резервном источнике. Попробуй позже.`
}

export function formatServiceUnavailable(): string {
  return 'Не удалось получить курс валют. Попробуй немного позже.'
}
