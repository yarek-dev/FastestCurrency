import type {
  CurrencyProviderName,
  RateObservation,
} from '../../../domain/currency.js'

function trimTrailingZeroes(value: string): string {
  return value.replace(/\.?0+$/, '')
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  const formatted = trimTrailingZeroes(value.toFixed(maximumFractionDigits))
  const [integer = '', fraction] = formatted.split('.')
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return fraction === undefined ? groupedInteger : `${groupedInteger}.${fraction}`
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

export function formatAmount(value: number): string {
  return formatAdaptive(value, 8)
}

export function formatConvertedAmount(value: number): string {
  return formatAdaptive(value, 2)
}

export function formatRate(value: number): string {
  return formatAdaptive(value, 6)
}

export function formatObservation(
  observation: RateObservation | undefined,
): string | undefined {
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

export function formatProvider(provider: CurrencyProviderName): string {
  return provider === 'currency-beacon'
    ? '📊 CurrencyBeacon'
    : '📊 Frankfurter, дневной справочный курс'
}

export function formatChange(changePercent: number): string {
  const roundedChange = Math.round(changePercent * 10) / 10

  return roundedChange > 0
    ? `▲ +${formatNumber(roundedChange, 1)}%`
    : roundedChange < 0
      ? `▼ ${formatNumber(roundedChange, 1)}%`
      : '• 0%'
}
