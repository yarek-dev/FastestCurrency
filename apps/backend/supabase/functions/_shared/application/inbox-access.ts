export type CheckInboxGrant = (userId: string) => Promise<'allowed' | 'forbidden' | 'unavailable'>

export type ResolveIdentity = (token: string) => Promise<
  { status: 'resolved'; userId: string } | { status: 'unauthorized' | 'unavailable' }
>

export function createResolveInboxAdmin(resolveIdentity: ResolveIdentity, checkGrant: CheckInboxGrant) {
  return async (token: string) => {
    const identity = await resolveIdentity(token)
    if (identity.status !== 'resolved') return identity
    const status = await checkGrant(identity.userId)
    return status === 'allowed' ? identity : { status }
  }
}
