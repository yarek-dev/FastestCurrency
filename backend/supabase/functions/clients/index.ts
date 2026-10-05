import { createSupabaseAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders } from '../_shared/cors.ts'

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

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('last_message_at', { ascending: false })

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
