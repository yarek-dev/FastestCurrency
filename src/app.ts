import Fastify from 'fastify'

import { createConvertCurrency } from './application/use-cases/convert-currency.js'
import { loadEnvironment } from './config/environment.js'
import { createCurrencyBeaconProvider } from './infrastructure/currency-beacon/currency-beacon-provider.js'
import { createFallbackProvider } from './infrastructure/exchange-rates/fallback-provider.js'
import { createFrankfurterProvider } from './infrastructure/frankfurter/frankfurter-provider.js'
import { createFastifyLogger } from './infrastructure/logging/fastify-logger.js'
import { healthRoutes } from './presentation/http/health-routes.js'
import { telegramWebhookRoutes } from './presentation/http/telegram-webhook-routes.js'
import { createTelegramUpdateHandler } from './presentation/telegram/telegram-update-handler.js'
import { toError } from './shared/errors.js'

const environment = loadEnvironment()
const app = Fastify({ logger: true })
const logger = createFastifyLogger(app.log)

const getFrankfurterRate = createFrankfurterProvider()
const getExchangeRate = environment.currencyBeaconApiKey
  ? createFallbackProvider({
      primary: createCurrencyBeaconProvider({
        apiKey: environment.currencyBeaconApiKey,
        logger,
      }),
      fallback: getFrankfurterRate,
      logger,
    })
  : getFrankfurterRate

if (!environment.currencyBeaconApiKey) {
  logger.error(
    { provider: 'currency-beacon' },
    'CurrencyBeacon is disabled because API key is missing; using Frankfurter',
  )
}

const convertCurrency = createConvertCurrency(getExchangeRate)
const handleTelegramUpdate = createTelegramUpdateHandler({
  convertCurrency,
  logger,
})

app.setErrorHandler((error, _request, reply) => {
  const normalizedError = toError(error, 'Unknown application error')

  logger.error({
    errorName: normalizedError.name,
    errorMessage: normalizedError.message,
    stack: normalizedError.stack,
  }, 'Unhandled application error')

  return reply.code(500).send({ error: 'Internal Server Error' })
})

await app.register(healthRoutes)
await app.register(telegramWebhookRoutes, {
  handleUpdate: handleTelegramUpdate,
  logger,
  webhookSecret: environment.telegramWebhookSecret,
})

app.listen({ port: environment.port }).catch((error) => {
  app.log.error(error)
  process.exit(1)
})
