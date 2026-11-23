import { deepStrictEqual, equal, match, throws } from 'node:assert/strict'
import { buildKnowledgeImportSql, parseKnowledgeExport } from '../../../scripts/import-knowledge.ts'

const source = {
  kind: 'page',
  source_url: 'https://example.test/consultations',
  source_title: "Guide's source",
  summary: 'Запись на платную консультацию.',
  checked_at: '2026-11-23T10:00:00Z',
}
const tariff = {
  kind: 'tariff',
  source_url: source.source_url,
  table: 2,
  row: 3,
  service: 'Консультация',
  audience: 'belarus_citizens',
  prices: [
    { label: 'Тариф', source_value: '140,01', price_type: 'fixed', amount: '140.01' },
    { label: 'Итого', source_value: 'от 145 до 180', price_type: 'range', amount: '145', max_amount: '180', currency: 'BYN' },
  ],
}

function jsonl(...rows: object[]) {
  return rows.map(row => JSON.stringify(row)).join('\n')
}

Deno.test('preserves exact prices, null currencies, ranges and distinct price columns', () => {
  const { sources, tariffs } = parseKnowledgeExport(jsonl(tariff, source))
  equal(sources.length, 1)
  equal(sources[0].body, source.summary)
  deepStrictEqual(tariffs.map(row => [row.source_key, row.amount, row.max_amount, row.currency]), [
    ['table-2:row-3:price-1', '140.01', null, null],
    ['table-2:row-3:price-2', '145', '180', 'BYN'],
  ])
})

Deno.test('keeps metadata for notices and scanned attachments without creating text chunks', () => {
  const { sources } = parseKnowledgeExport(jsonl(
    { ...source, kind: 'notice' },
    { ...source, source_url: 'https://example.test/catalog.pdf', kind: 'attachment', status: 'ocr_required' },
  ))
  deepStrictEqual(sources.map(row => [row.kind, row.body]), [['notice', null], ['attachment', null]])
})

Deno.test('rejects orphan tariff rows and duplicate source or tariff keys before running SQL', () => {
  throws(() => parseKnowledgeExport(jsonl(tariff, { ...source, source_url: 'https://example.test/another' })), /missing source/)
  throws(() => parseKnowledgeExport(jsonl(source, source)), /Line 2: Duplicate source URL/)
  throws(() => parseKnowledgeExport(jsonl(source, tariff, tariff)), /Line 3: Duplicate tariff key/)
})

Deno.test('imports one transaction with quoted data and source-based upsert keys', () => {
  const sql = buildKnowledgeImportSql(parseKnowledgeExport(jsonl(source, tariff)))
  match(sql, /^\s*begin;/)
  match(sql, /Guide''s source/)
  match(sql, /on conflict \(url\) do update/)
  match(sql, /on conflict \(source_id, position\) do update/)
  match(sql, /on conflict \(source_id, source_key\) do update/)
  match(sql, /commit;\s*$/)
})
