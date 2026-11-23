type InputRow = Record<string, unknown>

interface Source {
  url: string
  title: string
  kind: 'page' | 'notice' | 'attachment'
  body: string | null
  source_modified_at: string | null
  fetched_at: string
  content_sha256: string | null
}

interface Tariff {
  url: string
  source_key: string
  service_name: string
  section: string | null
  audience: string
  unit: string | null
  price_label: string
  source_value: string
  price_type: string
  amount: string
  max_amount: string | null
  currency: string | null
  effective_date: string | null
}

function object(value: unknown): InputRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object')
  }
  return value as InputRow
}

function requiredText(row: InputRow, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${field}`)
  return value
}

function optionalText(row: InputRow, field: string): string | null {
  return row[field] == null ? null : requiredText(row, field)
}

function tariffKey(row: InputRow, serviceName: string): string {
  if (row.table == null && row.row == null) return `text:${serviceName}`
  if (typeof row.table !== 'number' || !Number.isSafeInteger(row.table) || row.table < 1 ||
    typeof row.row !== 'number' || !Number.isSafeInteger(row.row) || row.row < 1) {
    throw new Error('Invalid tariff table or row')
  }
  return `table-${row.table}:row-${row.row}`
}

function readTariffs(row: InputRow, url: string): Tariff[] {
  const serviceName = requiredText(row, 'service')
  const key = tariffKey(row, serviceName)
  const prices = row.prices
  if (!Array.isArray(prices) || !prices.length) throw new Error('Missing tariff prices')
  return prices.map((input, index) => {
    const price = object(input)
    return {
      url,
      source_key: `${key}:price-${index + 1}`,
      service_name: serviceName,
      section: optionalText(row, 'section'),
      audience: optionalText(row, 'audience') ?? 'not_stated',
      unit: optionalText(row, 'unit'),
      price_label: requiredText(price, 'label'),
      source_value: requiredText(price, 'source_value'),
      price_type: requiredText(price, 'price_type'),
      amount: requiredText(price, 'amount'),
      max_amount: optionalText(price, 'max_amount'),
      currency: optionalText(price, 'currency'),
      effective_date: optionalText(row, 'effective_date'),
    }
  })
}

export function parseKnowledgeExport(input: string) {
  const sources = new Map<string, Source>()
  const tariffs: Tariff[] = []
  const tariffKeys = new Set<string>()
  for (const [index, line] of input.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try {
      const row = object(JSON.parse(line))
      const url = requiredText(row, 'source_url')
      const parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
        throw new Error('Invalid source URL')
      }
      const kind = row.kind
      if (kind === 'tariff') {
        for (const tariff of readTariffs(row, url)) {
          const key = JSON.stringify([url, tariff.source_key])
          if (tariffKeys.has(key)) throw new Error('Duplicate tariff key for source')
          tariffKeys.add(key)
          tariffs.push(tariff)
        }
        continue
      }
      if (kind !== 'page' && kind !== 'notice' && kind !== 'attachment') {
        throw new Error('Invalid source kind')
      }
      if (sources.has(url)) throw new Error('Duplicate source URL')
      sources.set(url, {
        url,
        title: requiredText(row, 'source_title'),
        kind,
        body: kind === 'notice' || row.status === 'ocr_required' ? null : optionalText(row, 'summary'),
        source_modified_at: optionalText(row, 'source_modified'),
        fetched_at: requiredText(row, 'checked_at'),
        content_sha256: optionalText(row, 'sha256'),
      })
    } catch (error) {
      throw new Error(`Line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!sources.size) throw new Error('No sources found in the export')
  for (const tariff of tariffs) {
    if (!sources.has(tariff.url)) throw new Error(`Tariff refers to a missing source: ${tariff.url}`)
  }
  return { sources: [...sources.values()], tariffs }
}

export function buildKnowledgeImportSql(batch: ReturnType<typeof parseKnowledgeExport>): string {
  const json = JSON.stringify(batch).replaceAll("'", "''")
  return `
begin;
set local standard_conforming_strings = on;
set local role service_role;
-- WordPress exports source_modified in the site's local time unless an offset is present.
set local timezone = 'Europe/Minsk';
create temporary table knowledge_import_payload on commit drop as select '${json}'::jsonb as data;

create temporary table knowledge_import_sources on commit drop as
select *
from jsonb_to_recordset((select data->'sources' from knowledge_import_payload)) as input(
    url text, title text, kind text, body text, source_modified_at timestamptz,
    fetched_at timestamptz, content_sha256 text
);

insert into public.knowledge_sources (url, title, kind, body, source_modified_at, fetched_at, content_sha256)
select url, title, kind, body, source_modified_at, fetched_at, content_sha256
from knowledge_import_sources order by url
on conflict (url) do update set
    title = excluded.title,
    kind = excluded.kind,
    body = coalesce(excluded.body, knowledge_sources.body),
    source_modified_at = excluded.source_modified_at,
    fetched_at = excluded.fetched_at,
    content_sha256 = excluded.content_sha256;

insert into public.knowledge_chunks (source_id, position, heading, body)
select s.id, 0, input.title, input.body
from knowledge_import_sources input join public.knowledge_sources s using (url)
where input.body is not null order by s.id
on conflict (source_id, position) do update set heading = excluded.heading, body = excluded.body;

insert into public.knowledge_tariffs (
    source_id, source_key, service_name, section, audience, unit, price_label,
    source_value, price_type, amount, max_amount, currency, effective_date
)
select s.id, t.source_key, t.service_name, t.section, t.audience, t.unit, t.price_label,
    t.source_value, t.price_type, t.amount, t.max_amount, t.currency, t.effective_date
from jsonb_to_recordset((select data->'tariffs' from knowledge_import_payload)) as t(
    url text, source_key text, service_name text, section text, audience text, unit text, price_label text,
    source_value text, price_type text, amount numeric, max_amount numeric, currency text, effective_date date
)
join public.knowledge_sources s using (url)
order by s.id, t.source_key
on conflict (source_id, source_key) do update set
    service_name = excluded.service_name,
    section = excluded.section,
    audience = excluded.audience,
    unit = excluded.unit,
    price_label = excluded.price_label,
    source_value = excluded.source_value,
    price_type = excluded.price_type,
    amount = excluded.amount,
    max_amount = excluded.max_amount,
    currency = excluded.currency,
    effective_date = excluded.effective_date;
commit;
`
}

async function main() {
  if (Deno.args.length > 1) throw new Error('Usage: pnpm knowledge:import [path-to-jsonl]')
  const input = Deno.args[0] ?? new URL('../../../docs/medcenter-paid-services.jsonl', import.meta.url)
  const batch = parseKnowledgeExport(await Deno.readTextFile(input))
  const db = new Deno.Command('docker', {
    args: [
      'exec', '-i', 'supabase_db_fullstack-bot', 'psql', '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres',
    ],
    stdin: 'piped',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn()
  const writer = db.stdin.getWriter()
  await writer.write(new TextEncoder().encode(buildKnowledgeImportSql(batch)))
  await writer.close()
  if (!(await db.status).success) throw new Error('The local database rejected the import')
  const chunks = batch.sources.filter(source => source.body !== null).length
  console.log(`Imported ${batch.sources.length} sources, ${chunks} text chunks and ${batch.tariffs.length} price entries into local Supabase.`)
}

if (import.meta.main) await main()
