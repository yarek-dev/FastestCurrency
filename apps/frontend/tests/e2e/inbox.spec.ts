import { test, expect } from '../support/inbox-fixture'

test('an admin opens a conversation, receives a new message and signs out', async ({ page, inbox }) => {
  await inbox.addMessages(['Как записаться на приём?'])

  await page.goto('/')
  await page.getByLabel('Email').fill(inbox.email)
  await page.getByLabel('Пароль').fill(inbox.password)
  const initialRecovery = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.ok()
      && url.pathname === '/functions/v1/messages'
      && url.searchParams.get('client_id') === inbox.clientId
      && url.searchParams.get('direction') === 'after'
  })
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await page.getByRole('textbox', { name: 'Найти клиента' }).fill(inbox.clientName)
  await page.getByRole('button', { name: new RegExp(inbox.clientName) }).click()
  const conversation = page.getByRole('region', { name: /^Переписка с клиентом / })
  await expect(conversation.getByText('Как записаться на приём?', { exact: true })).toBeVisible()

  await initialRecovery
  // A cold local Realtime worker can acknowledge the subscription before forwarding database changes.
  const liveName = `${inbox.clientName} Realtime`
  const liveHeading = conversation.getByRole('heading', { name: liveName, exact: true })
  await expect.poll(async () => {
    if (await liveHeading.isVisible()) return true
    await inbox.renameClient(liveName)
    return false
  }, { timeout: 15_000 }).toBe(true)

  await inbox.addMessages(['Можно записаться на завтра?'])
  await expect(conversation.getByText('Можно записаться на завтра?', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в админ-панель' })).toBeVisible()
})
