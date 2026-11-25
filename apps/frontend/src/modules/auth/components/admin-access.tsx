import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@frontend/src/components/ui/button'
import { getInboxClient } from '@frontend/src/lib/supabase'
import { useAdminSession } from '../hooks/use-admin-session'
import { LoginForm } from './login-form'
import styles from './admin-panel.module.css'

interface AdminAccessProps {
  children: (admin: { userId: string; signOutAction: ReactNode }) => ReactNode
}

export function AdminAccess({ children }: AdminAccessProps) {
  const client = getInboxClient()
  return client
    ? <AdminSession client={client}>{children}</AdminSession>
    : <main className={styles.page}><p role="alert">Подключение к Supabase не настроено.</p></main>
}

function AdminSession({ client, children }: AdminAccessProps & { client: SupabaseClient }) {
  const { userId, status, checkingSession, signingOut, signOutError, signIn, signOut, retryAccess } = useAdminSession(client)

  if (userId && status === 'allowed') {
    return children({
      userId,
      signOutAction: (
        <>
          {signOutError && <span className={styles.error} role="alert">Не удалось выйти.</span>}
          <Button variant="outline" size="sm" disabled={signingOut} onClick={signOut}>Выйти</Button>
        </>
      ),
    })
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        {checkingSession
          ? <p role="status">Проверяем сессию…</p>
          : status === 'failed'
            ? <>
                <p role="alert">Не удалось проверить доступ к админ-панели.</p>
                <Button onClick={retryAccess}>Повторить</Button>
                <Button variant="ghost" disabled={signingOut} onClick={signOut}>Выйти</Button>
                {signOutError && <p className={styles.error} role="alert">Не удалось выйти.</p>}
              </>
            : <LoginForm signIn={signIn} message={status === 'denied' ? 'У этого аккаунта нет доступа к админ-панели.' : undefined} />}
      </section>
    </main>
  )
}
