import { createClient } from 'npm:@supabase/supabase-js@2'
import { createGeminiEmbeddings } from '../supabase/functions/telegram-webhook/infrastructure/gemini/gemini-embeddings.ts'

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  const supabase = createClient(
    requireEnv('KNOWLEDGE_SUPABASE_URL'),
    requireEnv('KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { embedDocuments } = createGeminiEmbeddings(requireEnv('GEMINI_API_KEY'))
  let processed = 0

  while (true) {
    const { data, error } = await supabase.rpc('pending_knowledge_embeddings', { p_limit: 32 })
    if (error) throw new Error(`Could not read pending embeddings (${error.code})`)
    const pending: Array<{ content: string }> = data
    if (pending.length === 0) break

    const vectors = await embedDocuments(pending.map(({ content }) => content))
    const rows = pending.map(({ content }, index) => ({
      content,
      embedding: JSON.stringify(vectors[index]),
    }))
    const { error: writeError } = await supabase.rpc('save_knowledge_embeddings', { p_rows: rows })
    if (writeError) throw new Error(`Could not save embeddings (${writeError.code})`)

    processed += pending.length
    console.log(`Indexed ${processed} descriptions in this run.`)
  }

  if (processed === 0) console.log('Knowledge embeddings are up to date.')
}

if (import.meta.main) await main()
