import type { InboxReader } from '../../../_shared/application/inbox-reader.ts'
import { corsHeaders } from '../../../_shared/presentation/http/cors.ts'
import { inboxError, type IdentifyInboxAdmin } from '../../../_shared/presentation/http/inbox-access.ts'

export function createClientsHandler(dependencies?: { identify: IdentifyInboxAdmin; listClients: InboxReader['listClients'] }) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'GET') {
      return Response.json(
        { error: 'Method Not Allowed' },
        { status: 405, headers: { ...corsHeaders, Allow: 'GET, OPTIONS' } },
      )
    }

    if (!dependencies) return inboxError(500, corsHeaders)
    const { status: access } = await dependencies.identify(request)
    if (access !== 200) return inboxError(access, corsHeaders)

    try {
      return Response.json(await dependencies.listClients(), {
        headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      console.error('Failed to load clients', error)
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders },
      )
    }

  }
}
