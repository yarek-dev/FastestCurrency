import type {
  MessageRecord,
  MessageRepository,
} from '../ports/message-repository.ts'

interface ProcessTelegramUpdateOptions<TUpdate, TAction> {
  messageRepository: MessageRepository
  handleUpdate: (update: TUpdate) => Promise<TAction | undefined>
  toIncomingMessage: (update: TUpdate) => MessageRecord | undefined
  toOutgoingMessage: (
    update: TUpdate,
    action: TAction,
  ) => MessageRecord | undefined
}

export function createProcessTelegramUpdate<TUpdate, TAction>({
  messageRepository,
  handleUpdate,
  toIncomingMessage,
  toOutgoingMessage,
}: ProcessTelegramUpdateOptions<TUpdate, TAction>) {
  return async (update: TUpdate): Promise<TAction | undefined> => {
    const incomingMessage = toIncomingMessage(update)

    if (incomingMessage) {
      await messageRepository.save(incomingMessage)
    }

    const action = await handleUpdate(update)

    if (action) {
      const outgoingMessage = toOutgoingMessage(update, action)

      if (outgoingMessage) {
        await messageRepository.save(outgoingMessage)
      }
    }

    return action
  }
}
