import type { ParsedTelegramInput } from './telegram-input.js'

export type {
  ParsedTelegramInput,
  ParseErrorReason,
} from './telegram-input.js'

const TICKER_PATTERN = /(?<![A-Za-z0-9])[A-Za-z0-9]{1,20}(?![A-Za-z0-9])/g
const NUMBER_PATTERN = /(?<![A-Za-z0-9])[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?(?![A-Za-z0-9])/g
const COMPLETE_NUMBER_PATTERN = /^[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/i
const MAX_AMOUNT = 1_000_000_000_000
const MAX_DECIMAL_PLACES = 8

function findCurrencies(text: string): string[] {
  return [...text.matchAll(TICKER_PATTERN)]
    .map(([ticker]) => ticker)
    .filter((ticker) => /[A-Za-z]/.test(ticker) && !COMPLETE_NUMBER_PATTERN.test(ticker))
    .map((ticker) => ticker.toUpperCase())
}

function parseCommand(text: string): ParsedTelegramInput | undefined {
  const match = /^\/([a-z]+)(?:@[a-z0-9_]+)?(?:\s+(.*))?$/is.exec(text)

  if (!match) {
    return undefined
  }

  const command = match[1]?.toLowerCase()
  if (command === 'start' || command === 'help') {
    return { kind: 'command', command }
  }

  return { kind: 'command', command: 'help' }
}

function hasValidPrecision(rawAmount: string): boolean {
  const normalized = rawAmount.replace(',', '.')
  const fraction = normalized.split('.')[1]
  return !fraction || fraction.length <= MAX_DECIMAL_PLACES
}

function parseConversionText(trimmedText: string): ParsedTelegramInput {
  const currencies = findCurrencies(trimmedText)

  if (currencies.length === 0) {
    return { kind: 'error', reason: 'missing-currency' }
  }

  if (currencies.length > 2) {
    return {
      kind: 'error',
      reason: 'too-many-currencies',
      currencies,
    }
  }

  const amounts = trimmedText.match(NUMBER_PATTERN) ?? []

  if (amounts.length > 1) {
    return { kind: 'error', reason: 'multiple-amounts' }
  }

  let amount = 1
  if (amounts.length === 1) {
    const rawAmount = amounts[0] ?? ''
    const containsScientificNotation = /e/i.test(rawAmount)
    const parsedAmount = Number(rawAmount.replace(',', '.'))

    if (
      containsScientificNotation
      || !hasValidPrecision(rawAmount)
      || !Number.isFinite(parsedAmount)
      || parsedAmount <= 0
      || parsedAmount > MAX_AMOUNT
    ) {
      return { kind: 'error', reason: 'invalid-amount' }
    }

    amount = parsedAmount
  }

  return {
    kind: 'conversion',
    conversion: {
      amount,
      base: currencies[0]!,
      quote: currencies[1] ?? 'USD',
    },
  }
}

export function parseTelegramInput(text: string): ParsedTelegramInput {
  const trimmedText = text.trim()
  return parseCommand(trimmedText) ?? parseConversionText(trimmedText)
}
