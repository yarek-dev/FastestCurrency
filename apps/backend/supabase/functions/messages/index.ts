import { createSupabaseAdminClient } from '@backend/supabase/functions/_shared/supabase-admin.ts'
import { corsHeaders } from '@backend/supabase/functions/_shared/cors.ts'
import { parsePagination, toPage } from './pagination.ts'

const supabase = createSupabaseAdminClient()

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'GET') {
      return Response.json(
        { error: 'Method Not Allowed' },
        { status: 405, headers: { ...corsHeaders, Allow: 'GET, OPTIONS' } },
      )
    }

    if (!supabase) {
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders },
      )
    }

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
