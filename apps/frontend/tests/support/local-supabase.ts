import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

let config: { url: string; publicKey: string; serviceKey: string } | undefined

export function localSupabase() {
  if (config) return config

  let url = process.env.TEST_SUPABASE_URL
  let publicKey = process.env.TEST_SUPABASE_ANON_KEY
  let serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  if (!url && !publicKey && !serviceKey) {
    try {
      const status = JSON.parse(execSync('pnpm --silent supabase status -o json', {
        cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }))
      url = status.API_URL
      publicKey = status.ANON_KEY
      serviceKey = status.SERVICE_ROLE_KEY
    } catch {
      throw new Error('Start local Supabase with pnpm supabase start before running these tests.')
    }
  }
  if (!url || !publicKey || !serviceKey) {
    throw new Error('Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY together.')
  }
  const endpoint = new URL(url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('The tests create fixtures and require a loopback Supabase URL.')
  }
  config = { url: endpoint.origin, publicKey, serviceKey }
  return config
}
