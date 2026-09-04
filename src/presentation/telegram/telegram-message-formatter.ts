import type { ConversionResult, RateObservation } from '../../domain/currency.js'
import type { ParseErrorReason } from './telegram-update-parser.js'

const HELP_MESSAGE = `Отправь код валюты, криптовалюты или валютную пару.

Примеры:
EUR
BTC
100 USDT USD
0.00000001 BTC USD`

function trimTrailingZeroes(value: string): string {
  return value.replace(/\.?0+$/, '')
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return trimTrailingZeroes(value.toFixed(maximumFractionDigits))
}

function formatScientific(value: number): string {
  const [mantissa = '', exponent = '0'] = value.toExponential(7).split('e')
  return `${trimTrailingZeroes(mantissa)}e${Number(exponent)}`
}

function formatAdaptive(value: number, regularFractionDigits: number): string {
  const absoluteValue = Math.abs(value)

  if (absoluteValue > 0 && absoluteValue < 0.00000001) {
    return formatScientific(value)
  }

  return formatNumber(value, absoluteValue >= 1 ? regularFractionDigits : 8)
}

function formatConvertedAmount(value: number): string {
  return formatAdaptive(value, 2)
}

function formatRate(value: number): string {
  return formatAdaptive(value, 6)
}

function formatObservation(observation: RateObservation | undefined): string | undefined {
  if (!observation) {
    return undefined
  }

  if (observation.kind === 'date') {
    const [year, month, day] = observation.value.split('-')
    return year && month && day
      ? `🕘 ${day}.${month}.${year}`
      : undefined
  }

  const date = new Date(observation.value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `🕘 ${day}.${month}.${year}, ${hours}:${minutes} UTC`
}

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

export function formatConversionResult(result: ConversionResult): string {
  const amount = formatAdaptive(result.amount, 8)
  const convertedAmount = formatConvertedAmount(result.convertedAmount)
  const rate = formatRate(result.rate)
  const lines: string[] = [
    `🔄 ${result.base} → ${result.quote}`,
    '',
  ]

  lines.push(`🪙 ${amount} ${result.base} = ${convertedAmount} ${result.quote}`)

  if (result.amount !== 1) {
    lines.push(`💱 1 ${result.base} = ${rate} ${result.quote}`)
  }

  const observation = formatObservation(result.observedAt)
  lines.push('')
  if (observation) {
    lines.push(observation)
  }

  lines.push(
    result.provider === 'currency-beacon'
      ? '📊 CurrencyBeacon'
      : '📊 Frankfurter, дневной справочный курс',
  )

  return lines.join('\n')
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
