import type { Delivery } from './manager-handler.ts'

export function createTelegramSender(token: string, sendRequest = fetch) {
  return async (chatId: string, text: string, boldLength: number): Promise<Delivery> => {
    const response = await sendRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        entities: [{ type: 'bold', offset: 0, length: boldLength }],
      }),
      signal: AbortSignal.timeout(8_000),
    })
    const result = await response.json()
    if (response.ok && result?.ok === true) return 'done'
    if (response.status < 500 && result?.ok === false) return 'failed'
    return 'unknown'
  }
}
