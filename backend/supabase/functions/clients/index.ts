import { createSupabaseAdminClient } from '@backend/supabase/functions/_shared/supabase-admin.ts'
import { corsHeaders } from '@backend/supabase/functions/_shared/cors.ts'

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

    const { data, error } = await supabase.rpc('list_inbox_clients')

    if (error) {
      console.error('Failed to load clients', error)
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders },
      )
    }

    return Response.json(data, {
      headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
    })
  },
}
