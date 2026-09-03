import type { FastifyBaseLogger } from 'fastify'

import type { Logger } from '../../application/ports/logger.js'

export function createFastifyLogger(logger: FastifyBaseLogger): Logger {
  return {
    info: (context, message) => logger.info(context, message),
    warn: (context, message) => logger.warn(context, message),
    error: (context, message) => logger.error(context, message),
  }
}
