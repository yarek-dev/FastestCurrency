import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../support/inbox-fixture'

async function signIn(request: APIRequestContext, { url, publicKey, email, password }: {
  url: string; publicKey: string; email: string; password: string
}) {
  const response = await request.post(`${url}/functions/v1/admin-auth/login`, {
    headers: { apikey: publicKey },
    data: { email, password },
  })
  expect(response.status()).toBe(200)
  const { access_token } = await response.json()
  expect(access_token).toEqual(expect.any(String))
  return { apikey: publicKey, Authorization: `Bearer ${access_token}` }
}

test('messages API handles timestamp ties when paging backward and recovering forward', async ({ request, inbox }) => {
  const createdAt = '2026-10-05T10:00:00.123456Z'
  // Separate writes guarantee consecutive ordering even when all timestamps tie.
  await inbox.addMessages(['first'], createdAt)
  await inbox.addMessages(Array.from({ length: 19 }, (_, index) => `middle-${index}`), createdAt)
  await inbox.addMessages(['last'], createdAt)
  const headers = await signIn(request, inbox)
  const url = `${inbox.url}/functions/v1/messages`
  const params = { client_id: inbox.clientId }

  const response = await request.get(url, { headers, params })
  expect(response.status()).toBe(200)
  const page = await response.json()
  expect(page.items).toHaveLength(20)
  expect(page.items[0]).toMatchObject({ id: expect.any(String), body: 'last' })
  expect(page.nextCursor).toEqual(expect.any(String))

  const previous = await request.get(url, { headers, params: { ...params, cursor: page.nextCursor } })
  expect(previous.status()).toBe(200)
  const older = await previous.json()
  expect(older).toEqual({ items: [expect.objectContaining({ id: expect.any(String), body: 'first' })], nextCursor: null })
  expect(new Set([...page.items, ...older.items].map(item => item.id)).size).toBe(21)

  const recovered = await request.get(url, {
    headers, params: { ...params, direction: 'after', cursor: page.nextCursor },
  })
  expect(recovered.status()).toBe(200)
  expect(await recovered.json()).toEqual({ items: page.items.slice(0, -1).reverse(), nextCursor: null })
})

test('revoking the real admin grant immediately closes inbox HTTP access', async ({ request, inbox }) => {
  const headers = await signIn(request, inbox)
  const clientsUrl = `${inbox.url}/functions/v1/clients`
  const messagesUrl = `${inbox.url}/functions/v1/messages?client_id=${inbox.clientId}`
  expect((await request.get(clientsUrl, { headers })).status()).toBe(200)
  expect((await request.get(messagesUrl, { headers })).status()).toBe(200)

  await inbox.revokeInboxAccess()

  expect((await request.get(clientsUrl, { headers })).status()).toBe(403)
  expect((await request.get(messagesUrl, { headers })).status()).toBe(403)
})
