import type {
  ChangePeriodDays,
  ConversionResult,
  CurrencyProviderName,
  PeriodChangeRequest,
} from '../../../domain/currency.js'
import type { TelegramInlineKeyboardMarkup } from '../telegram-types.js'

export const CHANGE_PERIODS: ChangePeriodDays[] = [3, 7, 14, 30]

const CALLBACK_PREFIX = 'change'
const MAX_CALLBACK_BYTES = 64
const CURRENCY_PATTERN = /^[A-Z0-9]{1,20}$/

function isChangePeriod(value: number): value is ChangePeriodDays {
  return CHANGE_PERIODS.some((period) => period === value)
}

function isProvider(value: string): value is CurrencyProviderName {
  return value === 'currency-beacon' || value === 'frankfurter'
}

export function createPeriodCallbackData(
  result: ConversionResult,
  days: ChangePeriodDays,
): string {
  return [
    CALLBACK_PREFIX,
    result.base,
    result.quote,
    result.rate,
    result.provider,
    days,
  ].join('|')
}

export function parsePeriodCallbackData(
  data: string,
): Omit<PeriodChangeRequest, 'referenceDate'> | undefined {
  const [prefix, base, quote, rawRate, provider, rawDays, ...extra] = data.split('|')
  const currentRate = Number(rawRate)
  const days = Number(rawDays)

  if (
    prefix !== CALLBACK_PREFIX
    || !base
    || !quote
    || !CURRENCY_PATTERN.test(base)
    || !CURRENCY_PATTERN.test(quote)
    || !Number.isFinite(currentRate)
    || currentRate <= 0
    || !provider
    || !isProvider(provider)
    || !isChangePeriod(days)
    || extra.length > 0
  ) {
    return undefined
  }

  return { base, quote, currentRate, provider, days }
}

export function createPeriodKeyboard(
  result: ConversionResult,
): TelegramInlineKeyboardMarkup | undefined {
  const buttons = CHANGE_PERIODS.map((days) => ({
    text: `${days} дн.`,
    callback_data: createPeriodCallbackData(result, days),
  }))

  if (buttons.some((button) => (
    new TextEncoder().encode(button.callback_data).byteLength > MAX_CALLBACK_BYTES
  ))) {
    return undefined
  }

  return { inline_keyboard: [buttons] }
}
