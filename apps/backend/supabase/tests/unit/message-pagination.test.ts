import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { decodeCursor, encodeCursor, parsePagination, toPage } from '@backend/supabase/functions/messages/pagination.ts'

Deno.test('cursor preserves microseconds and bigint IDs', () => {
  const row = { id: '9223372036854775807', created_at: '2026-10-05T10:00:00.123456+00:00' }
  const cursor = encodeCursor(row)
  deepStrictEqual(decodeCursor(cursor), { id: row.id, createdAt: row.created_at })
  deepStrictEqual(parsePagination(new URL(`https://example.com/messages?client_id=42&direction=after&cursor=${cursor}`)), {
    p_client_id: '42', p_created_at: row.created_at, p_id: row.id, p_direction: 'after',
  })
})

Deno.test('pagination rejects malformed cursors and IDs', () => {
  for (const query of ['client_id=0', 'client_id=-1', 'client_id=9223372036854775808', 'client_id=1&direction=wrong', 'client_id=1&cursor=garbage']) {
    throws(() => parsePagination(new URL(`https://example.com/messages?${query}`)))
  }
})

Deno.test('extra row detects another page without skipping it', () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: String(21 - index), created_at: '2026-10-05T10:00:00Z' }))
  const page = toPage(rows)
  strictEqual(page.items.length, 20)
  strictEqual(decodeCursor(page.nextCursor!).id, '2')
  strictEqual(toPage(rows.slice(0, 20)).nextCursor, null)
  deepStrictEqual(toPage([]), { items: [], nextCursor: null })
})
