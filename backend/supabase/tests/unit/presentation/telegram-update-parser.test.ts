import { deepStrictEqual } from 'node:assert/strict'

import { parseTelegramInput } from '../../../functions/telegram-webhook/presentation/telegram/input/telegram-update-parser.ts'

const conversionCases = [
  ['EUR', { amount: 1, base: 'EUR', quote: 'USD' }],
  ['eur gbp', { amount: 1, base: 'EUR', quote: 'GBP' }],
  ['100 EUR USD', { amount: 100, base: 'EUR', quote: 'USD' }],
  ['  100.50   eur   gbp  ', { amount: 100.5, base: 'EUR', quote: 'GBP' }],
  ['100,50 EUR USD', { amount: 100.5, base: 'EUR', quote: 'USD' }],
  ['0.00000001 BTC USD', { amount: 0.00000001, base: 'BTC', quote: 'USD' }],
  ['USDT', { amount: 1, base: 'USDT', quote: 'USD' }],
  ['1INCH USD', { amount: 1, base: '1INCH', quote: 'USD' }],
  ['1000SATS BTC', { amount: 1, base: '1000SATS', quote: 'BTC' }],
  ['B USD', { amount: 1, base: 'B', quote: 'USD' }],
  ['1000000000000 EUR USD', { amount: 1_000_000_000_000, base: 'EUR', quote: 'USD' }],
] as const

for (const [input, conversion] of conversionCases) {
  Deno.test(`parses conversion input ${JSON.stringify(input)}`, () => {
    deepStrictEqual(parseTelegramInput(input), { kind: 'conversion', conversion })
  })
}

const commandCases = [
  ['/start', 'start'],
  ['/START@My_Bot trailing text', 'start'],
  ['/help', 'help'],
  ['/unknown', 'help'],
] as const

for (const [input, command] of commandCases) {
  Deno.test(`parses command ${JSON.stringify(input)} as ${command}`, () => {
    deepStrictEqual(parseTelegramInput(input), { kind: 'command', command })
  })
}

const errorCases = [
  ['', 'missing-currency'],
  ['123', 'missing-currency'],
  ['10 20 EUR USD', 'multiple-amounts'],
  ['0 EUR USD', 'invalid-amount'],
  ['-1 EUR USD', 'invalid-amount'],
  ['1000000000001 EUR USD', 'invalid-amount'],
  ['1.000000001 EUR USD', 'invalid-amount'],
  ['1e3 EUR USD', 'invalid-amount'],
  ['1 000 EUR USD', 'multiple-amounts'],
] as const

for (const [input, reason] of errorCases) {
  Deno.test(`rejects ${JSON.stringify(input)} with reason ${reason}`, () => {
    deepStrictEqual(parseTelegramInput(input), { kind: 'error', reason })
  })
}

Deno.test('reports every recognized currency when more than two are supplied', () => {
  deepStrictEqual(parseTelegramInput('100 eur usd gbp'), {
    kind: 'error',
    reason: 'too-many-currencies',
    currencies: ['EUR', 'USD', 'GBP'],
  })
})

Deno.test('does not recognize a ticker longer than the provider-safe limit', () => {
  deepStrictEqual(parseTelegramInput('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), {
    kind: 'error',
    reason: 'missing-currency',
  })
})
