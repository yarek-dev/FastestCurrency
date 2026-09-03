interface TaggedError extends Error {
  kind: string
}

export interface UnsupportedCurrencyError extends TaggedError {
  kind: 'unsupported-currency'
  currencies: string[]
}

export interface ProviderUnavailableError extends TaggedError {
  kind: 'provider-unavailable'
  provider: string
}

export interface ProviderConfigurationError extends TaggedError {
  kind: 'provider-configuration'
  provider: string
}

export interface AllProvidersFailedError extends TaggedError {
  kind: 'all-providers-failed'
  primaryError: Error
  fallbackError: Error
}

function hasErrorKind(error: unknown, kind: TaggedError['kind']): boolean {
  return error instanceof Error
    && 'kind' in error
    && error.kind === kind
}

export function createUnsupportedCurrencyError(
  currencies: string[],
): UnsupportedCurrencyError {
  return Object.assign(
    new Error(`Unsupported currency: ${currencies.join(', ')}`),
    {
      name: 'UnsupportedCurrencyError',
      kind: 'unsupported-currency' as const,
      currencies,
    },
  )
}

export function isUnsupportedCurrencyError(
  error: unknown,
): error is UnsupportedCurrencyError {
  return hasErrorKind(error, 'unsupported-currency')
}

export function createProviderUnavailableError(
  provider: string,
  message: string,
  options?: ErrorOptions,
): ProviderUnavailableError {
  return Object.assign(new Error(message, options), {
    name: 'ProviderUnavailableError',
    kind: 'provider-unavailable' as const,
    provider,
  })
}

export function createProviderConfigurationError(
  provider: string,
  message: string,
): ProviderConfigurationError {
  return Object.assign(new Error(message), {
    name: 'ProviderConfigurationError',
    kind: 'provider-configuration' as const,
    provider,
  })
}

export function isProviderConfigurationError(
  error: unknown,
): error is ProviderConfigurationError {
  return hasErrorKind(error, 'provider-configuration')
}

export function createAllProvidersFailedError(
  primaryError: Error,
  fallbackError: Error,
): AllProvidersFailedError {
  return Object.assign(
    new Error('All currency providers failed', { cause: fallbackError }),
    {
      name: 'AllProvidersFailedError',
      kind: 'all-providers-failed' as const,
      primaryError,
      fallbackError,
    },
  )
}

export function isAllProvidersFailedError(
  error: unknown,
): error is AllProvidersFailedError {
  return hasErrorKind(error, 'all-providers-failed')
}
