import type {
  MessageRecord,
  MessageRepository,
} from '../ports/message-repository.ts'

interface ProcessTelegramUpdateOptions<TUpdate, TAction> {
  messageRepository: MessageRepository
  handleUpdate: (update: TUpdate) => Promise<TAction | undefined>
  isManaged: (update: TUpdate) => Promise<boolean>
  toIncomingMessage: (update: TUpdate) => MessageRecord | undefined
  toOutgoingMessage: (
    update: TUpdate,
    action: TAction,
  ) => MessageRecord | undefined
}

export function createProcessTelegramUpdate<TUpdate, TAction>({
  messageRepository,
  handleUpdate,
  isManaged,
  toIncomingMessage,
  toOutgoingMessage,
}: ProcessTelegramUpdateOptions<TUpdate, TAction>) {
  return async (update: TUpdate): Promise<TAction | undefined> => {
    const incomingMessage = toIncomingMessage(update)

    if (incomingMessage) {
      await messageRepository.save(incomingMessage)
    }

    if (await isManaged(update)) return

    const action = await handleUpdate(update)

    if (action) {
      // An operator may have connected while the bot was preparing its response.
      if (await isManaged(update)) return
      const outgoingMessage = toOutgoingMessage(update, action)

      if (outgoingMessage) {
        await messageRepository.save(outgoingMessage)
      }
    }

    return action
  }
}
