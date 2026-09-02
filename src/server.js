import Fastify from 'fastify'

const app = Fastify({
  logger: true,
})

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

if (!webhookSecret) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET is not configured')
}

app.post('/telegram/webhook', async (request, reply) => {
  const providedSecret = request.headers['x-telegram-bot-api-secret-token']

  if (providedSecret !== webhookSecret) {
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
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
