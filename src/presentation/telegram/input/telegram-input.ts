import type { CurrencyConversion } from '../../../domain/currency.js'

export type ParseErrorReason =
  | 'invalid-amount'
  | 'missing-currency'
  | 'multiple-amounts'
  | 'too-many-currencies'

export type ParsedTelegramInput =
  | { kind: 'command'; command: 'help' | 'start' }
  | { kind: 'conversion'; conversion: CurrencyConversion }
  | { kind: 'error'; reason: ParseErrorReason; currencies?: string[] }
