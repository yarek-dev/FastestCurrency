import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const authActions = new Map([
  ['token?grant_type=password', 'login'],
  ['token?grant_type=refresh_token', 'refresh'],
  ['user', 'session'],
  ['logout?scope=local', 'logout'],
])

export function adminAuthFetch(supabaseUrl: string): typeof fetch {
  const authUrl = new URL('auth/v1/', `${supabaseUrl}/`)
  const edgeUrl = new URL('functions/v1/admin-auth/', `${supabaseUrl}/`)

  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (!url.href.startsWith(authUrl.href)) return fetch(input, init)

    const endpoint = `${url.pathname.slice(authUrl.pathname.length)}${url.search}`
    const action = authActions.get(endpoint)
    if (!action) return Promise.resolve(Response.json({ message: 'Unsupported auth operation' }, { status: 404 }))

    const target = new URL(action, edgeUrl)
    return fetch(input instanceof Request ? new Request(target, input) : target, init)
  }
}

let client: SupabaseClient | undefined

export function getInboxClient() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return

  return client ??= createClient(url, key, {
    auth: { detectSessionInUrl: false, storageKey: `fullstack-bot-admin:${new URL(url).host}` },
    global: { fetch: adminAuthFetch(url) },
  })
}
