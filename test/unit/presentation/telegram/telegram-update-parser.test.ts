import { describe, expect, it } from 'vitest'

import { parseTelegramInput } from '../../../../src/presentation/telegram/input/telegram-update-parser.js'

describe('parseTelegramInput', () => {
  it.each([
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
  ])('parses conversion input %j', (input, conversion) => {
    expect(parseTelegramInput(input)).toEqual({ kind: 'conversion', conversion })
  })

  it.each([
    ['/start', 'start'],
    ['/START@My_Bot trailing text', 'start'],
    ['/help', 'help'],
    ['/unknown', 'help'],
  ] as const)('parses command %j as %s', (input, command) => {
    expect(parseTelegramInput(input)).toEqual({ kind: 'command', command })
  })

  it.each([
    ['', 'missing-currency'],
    ['123', 'missing-currency'],
    ['10 20 EUR USD', 'multiple-amounts'],
    ['0 EUR USD', 'invalid-amount'],
    ['-1 EUR USD', 'invalid-amount'],
    ['1000000000001 EUR USD', 'invalid-amount'],
    ['1.000000001 EUR USD', 'invalid-amount'],
    ['1e3 EUR USD', 'invalid-amount'],
    ['1 000 EUR USD', 'multiple-amounts'],
  ] as const)('rejects %j with reason %s', (input, reason) => {
    expect(parseTelegramInput(input)).toEqual({ kind: 'error', reason })
  })

  it('reports every recognized currency when more than two are supplied', () => {
    expect(parseTelegramInput('100 eur usd gbp')).toEqual({
      kind: 'error',
      reason: 'too-many-currencies',
      currencies: ['EUR', 'USD', 'GBP'],
    })
  })

  it('does not recognize a ticker longer than the provider-safe limit', () => {
    expect(parseTelegramInput('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toEqual({
      kind: 'error',
      reason: 'missing-currency',
    })
  })
})
