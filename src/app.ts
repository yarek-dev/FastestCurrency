import Fastify from 'fastify'

import { createConvertCurrency } from './application/use-cases/convert-currency.js'
import { createGetPeriodChange } from './application/use-cases/get-period-change.js'
import { loadEnvironment } from './config/environment.js'
import { createCurrencyBeaconProvider } from './infrastructure/currency-beacon/currency-beacon-provider.js'
import {
  createExchangeRatePairProvider,
  createFallbackProvider,
} from './infrastructure/exchange-rates/fallback-provider.js'
import { createFrankfurterProvider } from './infrastructure/frankfurter/frankfurter-provider.js'
import { createFastifyLogger } from './infrastructure/logging/fastify-logger.js'
import { createAnswerCallbackQuery } from './infrastructure/telegram/telegram-bot-api.js'
import { healthRoutes } from './presentation/http/health-routes.js'
import { telegramWebhookRoutes } from './presentation/http/telegram-webhook-routes.js'
import { createTelegramUpdateHandler } from './presentation/telegram/index.js'
import { toError } from './shared/errors.js'

const environment = loadEnvironment()
const app = Fastify({ logger: true })
const logger = createFastifyLogger(app.log)

const getFrankfurterRate = createFrankfurterProvider()
const getCurrencyBeaconRate = environment.currencyBeaconApiKey
  ? createCurrencyBeaconProvider({
      apiKey: environment.currencyBeaconApiKey,
      logger,
    })
  : undefined
const getExchangeRatePair = getCurrencyBeaconRate
  ? createFallbackProvider({
      primary: getCurrencyBeaconRate,
      fallback: getFrankfurterRate,
      logger,
    })
  : createExchangeRatePairProvider(getFrankfurterRate)

if (!environment.currencyBeaconApiKey) {
  logger.error(
    { provider: 'currency-beacon' },
    'CurrencyBeacon is disabled because API key is missing; using Frankfurter',
  )
}

const convertCurrency = createConvertCurrency(getExchangeRatePair)
const getPeriodChange = createGetPeriodChange({
  ...(getCurrencyBeaconRate
    ? { 'currency-beacon': getCurrencyBeaconRate }
    : {}),
  frankfurter: getFrankfurterRate,
})
const handleTelegramUpdate = createTelegramUpdateHandler({
  answerCallbackQuery: createAnswerCallbackQuery(environment.telegramBotToken),
  convertCurrency,
  getPeriodChange,
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
