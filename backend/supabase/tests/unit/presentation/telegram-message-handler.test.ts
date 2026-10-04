import {
  deepStrictEqual,
  match,
  strictEqual,
} from 'node:assert/strict'

import type { ConvertCurrency } from '../../../functions/telegram-webhook/application/use-cases/convert-currency.ts'
import type { CurrencyConversion } from '../../../functions/telegram-webhook/domain/currency.ts'
import {
  createAllProvidersFailedError,
  createUnsupportedCurrencyError,
} from '../../../functions/telegram-webhook/domain/errors.ts'
import { createTelegramMessageHandler } from '../../../functions/telegram-webhook/presentation/telegram/handlers/telegram-message-handler.ts'
import {
  formatHelpMessage,
  formatParseError,
  formatStartMessage,
} from '../../../functions/telegram-webhook/presentation/telegram/messages/telegram-message-formatter.ts'
import type { TelegramUpdate } from '../../../functions/telegram-webhook/presentation/telegram/telegram-types.ts'

function privateUpdate(text?: string): TelegramUpdate {
  return {
    update_id: 42,
    message: {
      chat: { id: 123, type: 'private' },
      ...(text === undefined ? {} : { text }),
    },
  }
}

for (const [name, update] of [
  ['empty update', {}],
  ['group message', { message: { chat: { id: 123, type: 'group' }, text: 'EUR USD' } }],
  ['private message without chat id', { message: { chat: { type: 'private' }, text: 'EUR USD' } }],
] satisfies [string, TelegramUpdate][]) {
  Deno.test(`ignores ${name}`, async () => {
    let convertCurrencyCalled = false
    const handler = createTelegramMessageHandler({
      convertCurrency: () => {
        convertCurrencyCalled = true
        return Promise.reject(new Error('should not be called'))
      },
    })

    strictEqual(await handler(update), undefined)
    strictEqual(convertCurrencyCalled, false)
  })
}

Deno.test('returns help for a private non-text message', async () => {
  let convertCurrencyCalled = false
  const handler = createTelegramMessageHandler({
    convertCurrency: () => {
      convertCurrencyCalled = true
      return Promise.reject(new Error('should not be called'))
    },
  })

  deepStrictEqual(await handler(privateUpdate()), {
    method: 'sendMessage',
    chat_id: 123,
    text: formatHelpMessage(),
  })
  strictEqual(convertCurrencyCalled, false)
})

for (const [command, response] of [
  ['/start', formatStartMessage()],
  ['/help', formatHelpMessage()],
] as const) {
  Deno.test(`handles the ${command} command without converting`, async () => {
    let convertCurrencyCalled = false
    const handler = createTelegramMessageHandler({
      convertCurrency: () => {
        convertCurrencyCalled = true
        return Promise.reject(new Error('should not be called'))
      },
    })

    deepStrictEqual(await handler(privateUpdate(command)), {
      method: 'sendMessage',
      chat_id: 123,
      text: response,
    })
    strictEqual(convertCurrencyCalled, false)
  })
}

Deno.test('returns a parse error without calling the use case', async () => {
  let convertCurrencyCalled = false
  const handler = createTelegramMessageHandler({
    convertCurrency: () => {
      convertCurrencyCalled = true
      return Promise.reject(new Error('should not be called'))
    },
  })

  deepStrictEqual(await handler(privateUpdate('---')), {
    method: 'sendMessage',
    chat_id: 123,
    text: formatParseError('missing-currency'),
  })
  strictEqual(convertCurrencyCalled, false)
})

Deno.test('hides an unknown conversion failure from the user', async () => {
  const handler = createTelegramMessageHandler({
    convertCurrency: () => Promise.reject('secret failure detail'),
  })

  strictEqual(
    (await handler(privateUpdate('EUR USD')))?.text,
    'Не удалось получить курс валют. Попробуй немного позже.',
  )
})

Deno.test('converts a parsed request and returns a Telegram action with period buttons', async () => {
  let receivedInput: CurrencyConversion | undefined
  const convertCurrency: ConvertCurrency = (input) => {
    receivedInput = input
    return Promise.resolve({
      amount: 100,
      base: 'EUR',
      quote: 'USD',
      rate: 1.1,
      previousRate: 1,
      changePercent: 10,
      convertedAmount: 110,
      provider: 'frankfurter',
    })
  }
  const handler = createTelegramMessageHandler({ convertCurrency })

  const action = await handler(privateUpdate('100 eur usd'))

  deepStrictEqual(receivedInput, { amount: 100, base: 'EUR', quote: 'USD' })
  strictEqual(action?.method, 'sendMessage')
  strictEqual(action?.chat_id, 123)
  match(action?.text ?? '', /100 EUR = 110 USD/)
  deepStrictEqual(action?.reply_markup, {
    inline_keyboard: [[
      { text: '3 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|3' },
      { text: '7 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|7' },
      { text: '14 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|14' },
      { text: '30 дн.', callback_data: 'change|EUR|USD|1.1|frankfurter|30' },
    ]],
  })
})

Deno.test('returns a specific message for an unsupported currency', async () => {
  const convertCurrency: ConvertCurrency = () => Promise.reject(
    createUnsupportedCurrencyError(['ZZZ']),
  )
  const handler = createTelegramMessageHandler({ convertCurrency })

  const action = await handler(privateUpdate('ZZZ USD'))

  strictEqual(action?.text, 'Валюта ZZZ не найдена или не поддерживается.')
})

Deno.test('returns fallback guidance when only the fallback lacks the currency', async () => {
  const convertCurrency: ConvertCurrency = () => Promise.reject(
    createAllProvidersFailedError(
      new Error('primary offline'),
      createUnsupportedCurrencyError(['BTC']),
    ),
  )
  const handler = createTelegramMessageHandler({ convertCurrency })

  const action = await handler(privateUpdate('BTC USD'))

  strictEqual(
    action?.text,
    'Сейчас не удалось получить курс для BTC/USD. Валюта может быть недоступна в резервном источнике. Попробуй позже.',
  )
})

Deno.test('returns service unavailable when both providers fail operationally', async () => {
  const convertCurrency: ConvertCurrency = () => Promise.reject(
    createAllProvidersFailedError(
      new Error('primary offline'),
      new Error('fallback offline'),
    ),
  )
  const handler = createTelegramMessageHandler({ convertCurrency })

  const action = await handler(privateUpdate('EUR USD'))

  strictEqual(action?.text, 'Не удалось получить курс валют. Попробуй немного позже.')
})
