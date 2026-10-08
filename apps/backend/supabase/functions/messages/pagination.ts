export const pageSize = 20

interface Cursor {
  createdAt: string
  id: string
}

export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
    && value.length <= 19 && BigInt(value) <= 9223372036854775807n
}

export function encodeCursor(record: { created_at: string; id: string | number }): string {
  return btoa(JSON.stringify({ createdAt: record.created_at, id: String(record.id) }))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeCursor(value: string): Cursor {
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error()
    const cursor = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')))
    if (!validId(cursor.id) || typeof cursor.createdAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt)
      || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error()
    return cursor
  } catch {
    throw new Error('Invalid cursor')
  }
}

export function parsePagination(url: URL) {
  const clientId = url.searchParams.get('client_id')
  const direction = url.searchParams.get('direction') ?? 'before'
  const encoded = url.searchParams.get('cursor')
  if (!validId(clientId) || !['before', 'after'].includes(direction)) throw new Error('Invalid pagination parameters')
  const cursor = encoded === null ? null : decodeCursor(encoded)
  return {
    p_client_id: clientId,
    p_created_at: cursor?.createdAt ?? null,
    p_id: cursor?.id ?? null,
    p_direction: direction,
  }
}

export function toPage<T extends { created_at: string; id: string | number }>(records: T[]) {
  const items = records.slice(0, pageSize)
  return {
    items,
    nextCursor: records.length > pageSize ? encodeCursor(items[items.length - 1]) : null,
  }
}
