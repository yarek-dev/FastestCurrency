import { createResolveInboxAdmin } from '../_shared/application/inbox-access.ts'
import { createIdentifyInboxAdmin } from '../_shared/presentation/http/inbox-access.ts'
import { createSupabaseInboxAccess } from '../_shared/infrastructure/supabase-inbox-access.ts'
import { createSupabaseInboxReader } from '../_shared/infrastructure/supabase-inbox-reader.ts'
import { createSupabaseAdminClient } from '../_shared/infrastructure/supabase-admin.ts'
import { createManageConversation } from './application/manage-conversation.ts'
import { createInboxManagerHandler } from './presentation/http/manager-handler.ts'
import { createMessagesHandler } from './presentation/http/messages-handler.ts'
import { createSupabaseManagerOperations } from './infrastructure/supabase-manager-operations.ts'
import { createTelegramSender } from './infrastructure/telegram-sender.ts'

const supabase = createSupabaseAdminClient()
const access = supabase && createSupabaseInboxAccess(supabase)
const identify = access && createIdentifyInboxAdmin(createResolveInboxAdmin(access.resolveIdentity, access.checkGrant))
const token = Deno.env.get('TELEGRAM_BOT_TOKEN')

export default {
  fetch: createMessagesHandler(supabase && identify ? {
    identify,
    readHistory: createSupabaseInboxReader(supabase).readHistory,
    manage: token ? createInboxManagerHandler(identify,
      createManageConversation(createSupabaseManagerOperations(supabase), createTelegramSender(token))) : undefined,
  } : undefined),
}
