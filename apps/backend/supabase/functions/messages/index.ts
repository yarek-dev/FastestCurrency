import { createSupabaseAdminClient } from '../_shared/supabase-admin.ts'
import { authorizeInbox, identifyInboxAdmin, inboxError } from '../_shared/inbox-access.ts'
import { parsePagination, toPage } from './pagination.ts'
import { createInboxManagerHandler, messageCorsHeaders as corsHeaders } from './manager-handler.ts'
import { createTelegramSender } from './telegram-sender.ts'

const supabase = createSupabaseAdminClient()
const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
const manageConversation = supabase && token ? createInboxManagerHandler({
  identify: request => identifyInboxAdmin(supabase, request),
  async begin({ clientId, requestId, userId, action, body }) {
    const { data, error } = await supabase.rpc('begin_inbox_manager_action', {
      p_client_id: clientId, p_request_id: requestId, p_actor_id: userId, p_action: action, p_body: body,
    })
    if (error) throw error
    return data
  },
  deliver: createTelegramSender(token),
  async complete({ clientId, requestId }, delivery) {
    const { data, error } = await supabase.rpc('complete_inbox_manager_action', {
      p_client_id: clientId, p_request_id: requestId, p_delivery: delivery,
    })
    if (error) throw error
    return data
  },
}) : undefined

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method === 'POST') {
      return manageConversation ? manageConversation(request) : inboxError(503, corsHeaders)
    }

    if (request.method !== 'GET') {
      return Response.json(
        { error: 'Method Not Allowed' },
        { status: 405, headers: { ...corsHeaders, Allow: 'GET, POST, OPTIONS' } },
      )
    }

    if (!supabase) return inboxError(500, corsHeaders)
    const access = await authorizeInbox(supabase, request)
    if (access !== 200) return inboxError(access, corsHeaders)

    let parameters: ReturnType<typeof parsePagination>
    try {
      parameters = parsePagination(new URL(request.url))
    } catch {
      return Response.json({ error: 'Invalid pagination parameters' }, {
        status: 400, headers: corsHeaders,
      })
    }

    const { data, error } = await supabase.rpc('inbox_message_page', parameters)

    if (error) {
      console.error('Failed to load messages', error)
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders },
      )
    }

    return Response.json(toPage(data ?? []), {
      headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
    })
  },
}
