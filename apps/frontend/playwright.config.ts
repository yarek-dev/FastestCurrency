import { defineConfig } from '@playwright/test'
import { localSupabase } from './tests/support/local-supabase'

const { url, publicKey } = localSupabase()
const baseURL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL, browserName: 'chromium' },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    env: { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey },
  },
})
