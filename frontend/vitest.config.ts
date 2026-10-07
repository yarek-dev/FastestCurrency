import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@frontend': fileURLToPath(new URL('.', import.meta.url)) },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx,mts}'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
})
