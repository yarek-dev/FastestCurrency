import type { SWRConfiguration } from 'swr'

export const swrOptions: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  refreshInterval: 0,
  errorRetryCount: 3,
  errorRetryInterval: 1000,
  shouldRetryOnError: error => error?.name !== 'AbortError',
}
