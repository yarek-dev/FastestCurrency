import type { DeliverManagerMessage } from '../application/manage-conversation.ts'

const managerHeading = '🎧 Менеджер'
const noticeMarkers = { connect: '🟢 ', finish: '⚪ ' }

export function createTelegramSender(token: string, sendRequest = fetch): DeliverManagerMessage {
  return async (chatId, { action, body }) => {
    const marker = action === 'send' ? undefined : noticeMarkers[action]
    const text = marker ? marker + body : `${managerHeading}\n\n${body}`
    const entity = marker
      ? { type: 'italic', offset: marker.length, length: body.length }
      : { type: 'bold', offset: 0, length: managerHeading.length }
    const response = await sendRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        entities: [entity],
      }),
      signal: AbortSignal.timeout(8_000),
    })
    const result = await response.json()
    if (response.ok && result?.ok === true) return 'done'
    if (response.status < 500 && result?.ok === false) return 'failed'
    return 'unknown'
  }
}
