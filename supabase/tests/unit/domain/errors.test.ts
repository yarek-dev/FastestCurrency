import {
  deepStrictEqual,
  ok,
  strictEqual,
} from 'node:assert/strict'

import {
  createAllProvidersFailedError,
  createProviderConfigurationError,
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
  isAllProvidersFailedError,
  isProviderConfigurationError,
  isUnsupportedCurrencyError,
} from '../../../functions/telegram-webhook/domain/errors.ts'

Deno.test('creates and recognizes an unsupported currency error', () => {
  const error = createUnsupportedCurrencyError(['EUR', 'ZZZ'])

  ok(error instanceof Error)
  strictEqual(error.name, 'UnsupportedCurrencyError')
  strictEqual(error.message, 'Unsupported currency: EUR, ZZZ')
  strictEqual(error.kind, 'unsupported-currency')
  deepStrictEqual(error.currencies, ['EUR', 'ZZZ'])
  strictEqual(isUnsupportedCurrencyError(error), true)
  strictEqual(isUnsupportedCurrencyError(new Error('unsupported')), false)
  strictEqual(isUnsupportedCurrencyError({ kind: 'unsupported-currency' }), false)
})

Deno.test('creates and recognizes a provider configuration error', () => {
  const error = createProviderConfigurationError('currency-beacon', 'bad key')

  strictEqual(error.name, 'ProviderConfigurationError')
  strictEqual(error.message, 'bad key')
  strictEqual(error.kind, 'provider-configuration')
  strictEqual(error.provider, 'currency-beacon')
  strictEqual(isProviderConfigurationError(error), true)
  strictEqual(isProviderConfigurationError(undefined), false)
})

Deno.test('preserves the cause of a provider unavailable error', () => {
  const cause = new Error('socket closed')
  const error = createProviderUnavailableError(
    'frankfurter',
    'request failed',
    { cause },
  )

  strictEqual(error.name, 'ProviderUnavailableError')
  strictEqual(error.message, 'request failed')
  strictEqual(error.kind, 'provider-unavailable')
  strictEqual(error.provider, 'frankfurter')
  strictEqual(error.cause, cause)
})

Deno.test('creates and recognizes an aggregate provider error', () => {
  const primaryError = new Error('primary failed')
  const fallbackError = new Error('fallback failed')
  const error = createAllProvidersFailedError(primaryError, fallbackError)

  strictEqual(error.name, 'AllProvidersFailedError')
  strictEqual(error.message, 'All currency providers failed')
  strictEqual(error.kind, 'all-providers-failed')
  strictEqual(error.primaryError, primaryError)
  strictEqual(error.fallbackError, fallbackError)
  strictEqual(error.cause, fallbackError)
  strictEqual(isAllProvidersFailedError(error), true)
  strictEqual(isAllProvidersFailedError('all-providers-failed'), false)
})
