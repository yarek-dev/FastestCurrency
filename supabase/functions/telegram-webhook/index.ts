import '@supabase/functions-js/edge-runtime.d.ts'
import { createSupabaseAdminClient } from '../_shared/supabase-admin.ts'
import { createProcessTelegramUpdate } from './application/use-cases/process-telegram-update.ts'
import { createConvertCurrency } from './application/use-cases/convert-currency.ts'
import { createGetPeriodChange } from './application/use-cases/get-period-change.ts'
import { createCurrencyBeaconProvider } from './infrastructure/currency-beacon/currency-beacon-provider.ts'
import { createSupabaseMessageRepository } from './infrastructure/database/supabase-message-repository.ts'
import {
  createExchangeRatePairProvider,
  createFallbackProvider,
} from './infrastructure/exchange-rates/fallback-provider.ts'
import { createFrankfurterProvider } from './infrastructure/frankfurter/frankfurter-provider.ts'
import { createAnswerCallbackQuery } from './infrastructure/telegram/telegram-bot-api.ts'
import { createTelegramWebhookController } from './presentation/http/telegram-webhook-controller.ts'
import { createTelegramUpdateHandler } from './presentation/telegram/handlers/telegram-update-handler.ts'
import {
  toIncomingTelegramMessage,
  toOutgoingTelegramMessage,
} from './presentation/telegram/telegram-message-mapper.ts'

const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
const currencyBeaconApiKey = Deno.env.get('CURRENCY_BEACON_API_KEY')

const getFrankfurterRate = createFrankfurterProvider()
const getCurrencyBeaconRate = currencyBeaconApiKey
  ? createCurrencyBeaconProvider({ apiKey: currencyBeaconApiKey })
  : undefined
const getExchangeRatePair = getCurrencyBeaconRate
  ? createFallbackProvider({
    primary: getCurrencyBeaconRate,
    fallback: getFrankfurterRate,
  })
  : createExchangeRatePairProvider(getFrankfurterRate)
const convertCurrency = createConvertCurrency(getExchangeRatePair)
const getPeriodChange = createGetPeriodChange({
  ...(getCurrencyBeaconRate
    ? { 'currency-beacon': getCurrencyBeaconRate }
    : {}),
  frankfurter: getFrankfurterRate,
})
const answerCallbackQuery = createAnswerCallbackQuery(telegramBotToken ?? '')
const handleTelegramUpdate = createTelegramUpdateHandler({
  answerCallbackQuery,
  convertCurrency,
  getPeriodChange,
})

const supabase = createSupabaseAdminClient()
const messageRepository = supabase
  ? createSupabaseMessageRepository(supabase)
  : undefined
const processTelegramUpdate = telegramBotToken && messageRepository
  ? createProcessTelegramUpdate({
    messageRepository,
    handleUpdate: handleTelegramUpdate,
    toIncomingMessage: toIncomingTelegramMessage,
    toOutgoingMessage: toOutgoingTelegramMessage,
  })
  : undefined
const handleRequest = createTelegramWebhookController({
  webhookSecret,
  processTelegramUpdate,
})

export default { fetch: handleRequest }
