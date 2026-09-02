import Fastify from 'fastify'

const app = Fastify({
  logger: true,
})

app.get('/', async () => ({
  message: 'Fastify is running',
}))

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
