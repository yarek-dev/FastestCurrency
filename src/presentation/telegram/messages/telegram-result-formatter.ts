import type {
  ConversionResult,
  PeriodChangeResult,
} from '../../../domain/currency.js'
import {
  formatAmount,
  formatChange,
  formatConvertedAmount,
  formatObservation,
  formatProvider,
  formatRate,
} from './telegram-value-formatter.js'

export function formatConversionResult(result: ConversionResult): string {
  const amount = formatAmount(result.amount)
  const convertedAmount = formatConvertedAmount(result.convertedAmount)
  const rate = formatRate(result.rate)
  const lines: string[] = [
    `🔄 ${result.base} → ${result.quote}`,
    '',
  ]

  const indicator = formatChange(result.changePercent)

  lines.push(
    `🪙 ${amount} ${result.base} = ${result.amount === 1 ? rate : convertedAmount} ${result.quote}${result.amount === 1 ? `  ${indicator}` : ''}`,
  )

  if (result.amount !== 1) {
    lines.push(`💱 1 ${result.base} = ${rate} ${result.quote}  ${indicator}`)
  }
  lines.push(`📈 (вчера: ${formatRate(result.previousRate)} ${result.quote})`)

  const observation = formatObservation(result.observedAt)
  lines.push('')
  if (observation) {
    lines.push(observation)
  }

  lines.push(`${formatProvider(result.provider)}\n\n📊 Изменение курса за:`)

  return lines.join('\n')
}

export function formatPeriodChangeResult(result: PeriodChangeResult): string {
  const dayLabel = result.days === 3 ? 'дня' : 'дней'
  const observation = formatObservation({
    kind: 'timestamp',
    value: result.referenceDate.toISOString(),
  })
  const lines = [
    `🔄 ${result.base} → ${result.quote}`,
    '',
    `🪙 1 ${result.base} = ${formatRate(result.currentRate)} ${result.quote}`,
    `📈 (${result.days} ${dayLabel} назад: ${formatRate(result.historicalRate)} ${result.quote})`,
    `Изменение за ${result.days} ${dayLabel}: ${formatChange(result.changePercent)}`,
    '',
  ]

  if (observation) {
    lines.push(observation)
  }
  lines.push(formatProvider(result.provider))

  return lines.join('\n')
}
