import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAnswerCallbackQuery } from '../../../../src/infrastructure/telegram/telegram-bot-api.js'

describe('createAnswerCallbackQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('acknowledges a callback through Telegram Bot API', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await createAnswerCallbackQuery('secret-token')('callback-1')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botsecret-token/answerCallbackQuery',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ callback_query_id: 'callback-1' }),
      }),
    )
  })

  it('rejects a Telegram API error', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: 'query is too old' }), {
        status: 400,
      }),
    ))

    await expect(
      createAnswerCallbackQuery('secret-token')('callback-1'),
    ).rejects.toThrow('query is too old')
  })
})
