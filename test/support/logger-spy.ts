import { vi } from 'vitest'

import type { Logger } from '../../src/application/ports/logger.js'

export function createLoggerSpy() {
  return {
    info: vi.fn<Logger['info']>(),
    warn: vi.fn<Logger['warn']>(),
    error: vi.fn<Logger['error']>(),
  }
}
