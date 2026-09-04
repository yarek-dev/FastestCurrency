import { describe, expect, it } from 'vitest'

import {
  createAllProvidersFailedError,
  createProviderConfigurationError,
  createProviderUnavailableError,
  createUnsupportedCurrencyError,
  isAllProvidersFailedError,
  isProviderConfigurationError,
  isUnsupportedCurrencyError,
} from '../../../src/domain/errors.js'

describe('domain errors', () => {
  it('creates and recognizes an unsupported currency error', () => {
    const error = createUnsupportedCurrencyError(['EUR', 'ZZZ'])

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: 'UnsupportedCurrencyError',
      message: 'Unsupported currency: EUR, ZZZ',
      kind: 'unsupported-currency',
      currencies: ['EUR', 'ZZZ'],
    })
    expect(isUnsupportedCurrencyError(error)).toBe(true)
    expect(isUnsupportedCurrencyError(new Error('unsupported'))).toBe(false)
    expect(isUnsupportedCurrencyError({ kind: 'unsupported-currency' })).toBe(false)
  })

  it('creates and recognizes a provider configuration error', () => {
    const error = createProviderConfigurationError('currency-beacon', 'bad key')

    expect(error).toMatchObject({
      name: 'ProviderConfigurationError',
      message: 'bad key',
      kind: 'provider-configuration',
      provider: 'currency-beacon',
    })
    expect(isProviderConfigurationError(error)).toBe(true)
    expect(isProviderConfigurationError(undefined)).toBe(false)
  })

  it('preserves the cause of a provider unavailable error', () => {
    const cause = new Error('socket closed')
    const error = createProviderUnavailableError(
      'frankfurter',
      'request failed',
      { cause },
    )

    expect(error).toMatchObject({
      name: 'ProviderUnavailableError',
      message: 'request failed',
      kind: 'provider-unavailable',
      provider: 'frankfurter',
      cause,
    })
  })

  it('creates and recognizes an aggregate provider error', () => {
    const primaryError = new Error('primary failed')
    const fallbackError = new Error('fallback failed')
    const error = createAllProvidersFailedError(primaryError, fallbackError)

    expect(error).toMatchObject({
      name: 'AllProvidersFailedError',
      message: 'All currency providers failed',
      kind: 'all-providers-failed',
      primaryError,
      fallbackError,
      cause: fallbackError,
    })
    expect(isAllProvidersFailedError(error)).toBe(true)
    expect(isAllProvidersFailedError('all-providers-failed')).toBe(false)
  })
})
