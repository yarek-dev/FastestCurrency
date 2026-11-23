import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { SWRConfig } from 'swr'
import { Button } from '@frontend/src/components/ui/button'
import { getInboxClient } from '@frontend/src/lib/supabase'
import { ChatsPage } from '../chats'
import { swrOptions } from '../chats/api/swr-config'
import { LoginForm } from './login-form'
import styles from './admin-panel.module.css'

const inboxCache = { ...swrOptions, provider: () => new Map() }

export function AdminPanel() {
  const client = getInboxClient()
  return client
    ? <AdminSession client={client} />
    : <main className={styles.page}><p role="alert">Подключение к Supabase не настроено.</p></main>
}

function AdminSession({ client }: { client: SupabaseClient }) {
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
  if (userId && status === 'allowed') {
    return (
      <SWRConfig key={userId} value={inboxCache}>
        <ChatsPage adminUserId={userId} headerAction={
          <>
            {signOutError && <span className={styles.error} role="alert">Не удалось выйти.</span>}
            <Button variant="outline" size="sm" disabled={signingOut} onClick={signOut}>Выйти</Button>
          </>
        } />
      </SWRConfig>
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        {session === undefined || (userId && !status)
          ? <p role="status">Проверяем сессию…</p>
          : status === 'failed'
            ? <>
                <p role="alert">Не удалось проверить доступ к админ-панели.</p>
                <Button onClick={() => { setAccess(undefined); setAccessAttempt(attempt => attempt + 1) }}>Повторить</Button>
                <Button variant="ghost" disabled={signingOut} onClick={signOut}>Выйти</Button>
                {signOutError && <p className={styles.error} role="alert">Не удалось выйти.</p>}
              </>
            : <LoginForm signIn={signIn} message={status === 'denied' ? 'У этого аккаунта нет доступа к админ-панели.' : undefined} />}
      </section>
    </main>
  )
}
