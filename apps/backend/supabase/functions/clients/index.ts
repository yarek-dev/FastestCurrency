import { createResolveInboxAdmin } from '../_shared/application/inbox-access.ts'
import { createIdentifyInboxAdmin } from '../_shared/presentation/http/inbox-access.ts'
import { createSupabaseInboxAccess } from '../_shared/infrastructure/supabase-inbox-access.ts'
import { createSupabaseInboxReader } from '../_shared/infrastructure/supabase-inbox-reader.ts'
import { createSupabaseAdminClient } from '../_shared/infrastructure/supabase-admin.ts'
import { createClientsHandler } from './presentation/http/handler.ts'

const supabase = createSupabaseAdminClient()
const access = supabase && createSupabaseInboxAccess(supabase)
export default {
  fetch: createClientsHandler(supabase && access ? {
    identify: createIdentifyInboxAdmin(createResolveInboxAdmin(access.resolveIdentity, access.checkGrant)),
    listClients: createSupabaseInboxReader(supabase).listClients,
  } : undefined),
}
