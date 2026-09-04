interface TelegramApiResponse {
  ok?: boolean
  description?: string
}

export type AnswerCallbackQuery = (callbackQueryId: string) => Promise<void>

export function createAnswerCallbackQuery(
  botToken: string,
  timeoutMs = 3_000,
): AnswerCallbackQuery {
  return async (callbackQueryId) => {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    )

    let payload: TelegramApiResponse
    try {
      payload = await response.json() as TelegramApiResponse
    } catch {
      throw new Error(`Telegram Bot API returned invalid JSON (HTTP ${response.status})`)
    }

    if (!response.ok || payload.ok !== true) {
      throw new Error(
        `Telegram rejected callback acknowledgement: ${payload.description ?? `HTTP ${response.status}`}`,
      )
    }
  }
}
