import Fastify from 'fastify'

const app = Fastify({
  logger: true,
})

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

app.get('/health', async () => ({
  status: 'ok',
  telegramBotTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  telegramWebhookSecretConfigured: Boolean(webhookSecret),
}))

app.post('/telegram/webhook', async (request, reply) => {
  const providedSecret = request.headers['x-telegram-bot-api-secret-token']

  if (!webhookSecret || providedSecret !== webhookSecret) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  const update = request.body ?? {}
  const message = update.message

  app.log.info({
    updateId: update.update_id,
    chatId: message?.chat?.id,
    text: message?.text,
  }, 'Telegram update received')

  return reply.code(200).send({ ok: true })
})

const port = Number(process.env.PORT) || 3000

try {
  await app.listen({ port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
