import type { CheckInboxGrant } from '../../_shared/application/inbox-access.ts'

export type AdminSessionCommand =
  | { action: 'login'; email: string; password: string }
  | { action: 'refresh'; refreshToken: string }
  | { action: 'session' | 'logout'; token: string }

type AuthExchangeResult<Forwarded> =
  | { kind: 'identity'; userId?: string; payload: unknown }
  | { kind: 'forward'; response: Forwarded }
  | { kind: 'unavailable' }

export type ExchangeAdminSession<Forwarded> = (command: AdminSessionCommand) => Promise<AuthExchangeResult<Forwarded>>

export function createAdminSession<Forwarded>(
  exchange: ExchangeAdminSession<Forwarded>,
  checkGrant: CheckInboxGrant,
) {
  return async (command: AdminSessionCommand) => {
    try {
      const result = await exchange(command)
      if (result.kind !== 'identity') return result
      if (!result.userId) return { kind: 'unavailable' } as const
      const grant = await checkGrant(result.userId)
      return grant === 'allowed' ? result : { kind: grant } as const
    } catch {
      return { kind: 'unavailable' } as const
    }
  }
}
