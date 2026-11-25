import { test, expect } from '../support/inbox-fixture'

test('an admin opens a conversation, receives a new message and signs out', async ({ page, inbox }) => {
  await inbox.addMessages(['Как записаться на приём?'])

  await page.goto('/')
  await page.getByLabel('Email').fill(inbox.email)
  await page.getByLabel('Пароль').fill(inbox.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await page.getByRole('textbox', { name: 'Найти клиента' }).fill(inbox.clientName)
  await page.getByRole('button', { name: new RegExp(inbox.clientName) }).click()
  const conversation = page.getByRole('region', { name: `Переписка с клиентом ${inbox.clientName}` })
  await expect(conversation.getByText('Как записаться на приём?', { exact: true })).toBeVisible()

  await inbox.addMessages(['Можно записаться на завтра?'])
  await expect(conversation.getByText('Можно записаться на завтра?', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в админ-панель' })).toBeVisible()
})
