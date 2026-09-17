import { createSupabaseAdminClient } from '../_shared/supabase-admin.ts'

const supabase = createSupabaseAdminClient()

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return Response.json(
        { error: 'Method Not Allowed' },
        { status: 405 },
      )
    }

    if (!supabase) {
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      )
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load messages', error)
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      )
    }

    return Response.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  },
}
