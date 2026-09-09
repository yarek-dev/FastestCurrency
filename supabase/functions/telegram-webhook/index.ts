import "@supabase/functions-js/edge-runtime.d.ts"
import { createConvertCurrency } from "./application/use-cases/convert-currency.ts"
import { createGetPeriodChange } from "./application/use-cases/get-period-change.ts"
import { createCurrencyBeaconProvider } from "./infrastructure/currency-beacon/currency-beacon-provider.ts"
import {
    createExchangeRatePairProvider,
    createFallbackProvider,
} from "./infrastructure/exchange-rates/fallback-provider.ts"
import { createFrankfurterProvider } from "./infrastructure/frankfurter/frankfurter-provider.ts"
import { createAnswerCallbackQuery } from "./infrastructure/telegram/telegram-bot-api.ts"
import { createTelegramUpdateHandler } from "./presentation/telegram/handlers/telegram-update-handler.ts"
import type { TelegramUpdate } from "./presentation/telegram/telegram-types.ts"

const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN")
const currencyBeaconApiKey = Deno.env.get("CURRENCY_BEACON_API_KEY")

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
        ? { "currency-beacon": getCurrencyBeaconRate }
        : {}),
    frankfurter: getFrankfurterRate,
})
const answerCallbackQuery = createAnswerCallbackQuery(telegramBotToken ?? "")
const handleTelegramUpdate = createTelegramUpdateHandler({
    answerCallbackQuery,
    convertCurrency,
    getPeriodChange,
})

function isTelegramUpdate(value: unknown): value is TelegramUpdate {
    return typeof value === "object" && value !== null
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method !== "POST") {
            return Response.json(
                { error: "Method Not Allowed" },
                { status: 405 },
            )
        }

        if (!webhookSecret || !telegramBotToken) {
            return Response.json(
                { error: "Internal Server Error" },
                { status: 500 },
            )
        }

        const providedSecret = request.headers.get(
            "x-telegram-bot-api-secret-token",
        )

        if (providedSecret !== webhookSecret) {
            return Response.json(
                { error: "Unauthorized" },
                { status: 401 },
            )
        }

        let update: unknown

        try {
            update = await request.json()
        } catch {
            return Response.json(
                { error: "Bad Request" },
                { status: 400 },
            )
        }

        if (!isTelegramUpdate(update)) {
            return Response.json(
                { error: "Bad Request" },
                { status: 400 },
            )
        }

        const action = await handleTelegramUpdate(update)
        return Response.json(action ?? { ok: true })
    },
}
