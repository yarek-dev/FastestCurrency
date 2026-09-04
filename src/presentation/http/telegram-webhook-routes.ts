import type { FastifyPluginAsync } from 'fastify'

import type { Logger } from '../../application/ports/logger.js'
import type {
  HandleTelegramUpdate,
  TelegramUpdate,
} from '../telegram/index.js'

interface TelegramWebhookRouteOptions {
  handleUpdate: HandleTelegramUpdate
  logger: Logger
  webhookSecret: string
}

const telegramUpdateSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    update_id: { type: 'integer' },
    message: {
      type: 'object',
      additionalProperties: true,
      properties: {
        text: { type: 'string' },
        chat: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'integer' },
            type: { type: 'string' },
          },
        },
      },
    },
    callback_query: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        data: { type: 'string' },
        message: {
          type: 'object',
          additionalProperties: true,
          properties: {
            date: { type: 'integer' },
            chat: {
              type: 'object',
              additionalProperties: true,
              properties: {
                id: { type: 'integer' },
                type: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const

const webhookResponseSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['method', 'chat_id', 'text'],
      properties: {
        method: { type: 'string', const: 'sendMessage' },
        chat_id: { type: 'integer' },
        text: { type: 'string' },
        reply_markup: {
          type: 'object',
          additionalProperties: false,
          required: ['inline_keyboard'],
          properties: {
            inline_keyboard: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['text', 'callback_data'],
                  properties: {
                    text: { type: 'string' },
                    callback_data: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
} as const

export const telegramWebhookRoutes: FastifyPluginAsync<TelegramWebhookRouteOptions> = async (
  app,
  options,
) => {
  app.post<{ Body: TelegramUpdate }>('/telegram/webhook', {
    attachValidation: true,
    schema: {
      body: telegramUpdateSchema,
      response: {
        200: webhookResponseSchema,
        401: {
          type: 'object',
          additionalProperties: false,
          required: ['error'],
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    onRequest: async (request, reply) => {
      const providedSecret = request.headers['x-telegram-bot-api-secret-token']

      if (providedSecret !== options.webhookSecret) {
        await reply.code(401).send({ error: 'Unauthorized' })
      }
    },
  }, async (request, reply) => {
    if (request.validationError) {
      options.logger.warn({
        updateId: request.body?.update_id,
        validationContext: request.validationError.validationContext,
      }, 'Invalid Telegram update ignored')

      return reply.code(200).send({ ok: true })
    }

    const action = await options.handleUpdate(request.body)

    return reply.code(200).send(action ?? { ok: true })
  })
}
