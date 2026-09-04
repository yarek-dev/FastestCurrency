import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/application/use-cases/convert-currency.ts',
        'src/domain/errors.ts',
        'src/infrastructure/currency-beacon/currency-beacon-provider.ts',
        'src/infrastructure/exchange-rates/fallback-provider.ts',
        'src/presentation/telegram/telegram-message-formatter.ts',
        'src/presentation/telegram/telegram-update-handler.ts',
        'src/presentation/telegram/telegram-update-parser.ts',
      ],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
})
