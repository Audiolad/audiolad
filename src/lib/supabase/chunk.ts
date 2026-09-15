/**
 * Chunk ID lists for PostgREST `.in(...)` filters.
 *
 * Production evidence (Audiolad nginx → Kong → PostgREST): PostgREST echoes the
 * full request query string in the `Content-Location` response header. A large
 * `.in.(uuid,uuid,…)` list makes that header exceed nginx's default
 * `proxy_buffer_size` (4k) around ~93 UUIDs, which surfaces as
 * `upstream sent too big header` / HTTP 502. Chunking keeps each `.in(...)`
 * safely under that limit (and below typical URL-length pressure).
 */
export const POSTGREST_IN_FILTER_CHUNK_SIZE = 50;

export function chunkIds<T>(
  ids: readonly T[],
  chunkSize: number = POSTGREST_IN_FILTER_CHUNK_SIZE,
): T[][] {
  const size =
    Number.isFinite(chunkSize) && chunkSize > 0
      ? Math.floor(chunkSize)
      : POSTGREST_IN_FILTER_CHUNK_SIZE;
  const chunks: T[][] = [];

  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size) as T[]);
  }

  return chunks;
}
