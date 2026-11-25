import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

export function useAdminSession(client: SupabaseClient) {
  const [session, setSession] = useState<Session | null>()
  const [access, setAccess] = useState<{ userId: string; status: 'allowed' | 'denied' | 'failed' }>()
  const [accessAttempt, setAccessAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      if (!currentSession) setAccess(undefined)
    })
    return () => subscription.unsubscribe()
  }, [client])

  useEffect(() => {
    if (!userId) return
    let active = true
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return
      const status = data.user?.id === userId ? 'allowed'
        : error?.status === 401 || error?.status === 403 ? 'denied' : 'failed'
      setAccess({ userId, status })
    }).catch(() => {
      if (active) setAccess({ userId, status: 'failed' })
    })
    return () => { active = false }
  }, [client, userId, accessAttempt])

  async function signIn(values: { email: string; password: string }) {
    setSignOutError(false)
    try {
      const { error } = await client.auth.signInWithPassword(values)
      if (!error) {
        setAccessAttempt(attempt => attempt + 1)
        return
      }
      if (error.status === 400 || error.status === 401) return 'Проверьте email и пароль.'
      if (error.status === 403) return 'У этого аккаунта нет доступа к админ-панели.'
      if (error.status === 429) return 'Слишком много попыток. Попробуйте позже.'
    } catch {
      return 'Не удалось подключиться. Попробуйте ещё раз.'
    }
    return 'Не удалось войти. Попробуйте ещё раз.'
  }

  async function signOut() {
    setSigningOut(true)
    setSignOutError(false)
    try {
      const { error } = await client.auth.signOut({ scope: 'local' })
      setSignOutError(Boolean(error))
    } catch {
      setSignOutError(true)
    } finally {
      setSigningOut(false)
    }
  }

  const status = userId && access?.userId === userId ? access.status : undefined

  function retryAccess() {
    setAccess(undefined)
    setAccessAttempt(attempt => attempt + 1)
  }

  return {
    userId,
    status,
    checkingSession: session === undefined || Boolean(userId && !status),
    signingOut,
    signOutError,
    signIn,
    signOut,
    retryAccess,
  }
}
