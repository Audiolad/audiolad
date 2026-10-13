import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PostgrestClient } from "@supabase/postgrest-js";

import {
  ADMIN_MUSIC_TRACKS_ID_CHUNK_SIZE,
  chunkIds,
  listAdminMusicTracks,
} from "../src/lib/admin/music-tracks-queries";

// Production gateway returned 502 for GET URLs of ~3.7 KB+ (100 UUIDs in an
// in.() filter); 80 UUIDs (~3 KB) passed. Emulate a stricter 2.5 KB limit.
const GATEWAY_URL_LIMIT = 2500;

type Row = Record<string, unknown>;

function buildDataset(practiceCount: number, tracksPerPractice: number) {
  const authors = Array.from({ length: 21 }, (_, i) => ({
    id: randomUUID(),
    name: `Автор ${i}`,
    slug: `author-${i}`,
  }));
  const practices = Array.from({ length: practiceCount }, (_, i) => ({
    id: randomUUID(),
    title: `Альбом ${i}`,
    author_id: authors[i % authors.length].id,
  }));
  let seq = 0;
  const audio = practices.flatMap((p) =>
    Array.from({ length: tracksPerPractice }, (_, pos) => ({
      id: randomUUID(),
      practice_id: p.id,
      title: `Трек ${pos}`,
      position: pos,
      music_track_code: `AL-T-${String(++seq).padStart(9, "0")}`,
    })),
  );
  return { authors, practices, audio };
}

function fakeFetch(data: ReturnType<typeof buildDataset>, urls: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    urls.push(url.toString());
    if (url.toString().length > GATEWAY_URL_LIMIT) {
      return new Response("<html>502 Bad Gateway</html>", { status: 502 });
    }
    const table = url.pathname.split("/").pop();
    const inFilter = (col: string) => {
      const raw = url.searchParams.get(col);
      if (!raw) return null;
      const m = /^in\.\((.*)\)$/.exec(raw);
      return m ? new Set(m[1].split(",")) : null;
    };
    let rows: Row[];
    if (table === "practices") rows = data.practices;
    else if (table === "authors") {
      const ids = inFilter("id");
      rows = data.authors.filter((a) => ids?.has(a.id));
    } else if (table === "audio_items") {
      const ids = inFilter("practice_id");
      rows = data.audio.filter((a) => ids?.has(a.practice_id));
    } else return new Response("{}", { status: 404 });

    const range = /(\d+)-(\d+)/.exec(
      (url.searchParams.get("offset") ?? "") ||
        (Object.fromEntries(url.searchParams).range ?? ""),
    );
    const offset = Number(url.searchParams.get("offset") ?? range?.[1] ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 1000);
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function client(fetchImpl: typeof fetch) {
  return new PostgrestClient("https://db.example.test/rest/v1", {
    fetch: fetchImpl,
  }) as unknown as Parameters<typeof listAdminMusicTracks>[0];
}

// chunkIds
assert.deepEqual(chunkIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(chunkIds([], 3), []);
assert.throws(() => chunkIds([1], 0));
assert.ok(ADMIN_MUSIC_TRACKS_ID_CHUNK_SIZE <= 50);

// Regression: production shape (113 music products, 751 tracks) loads
// without exceeding gateway URL limit.
{
  const data = buildDataset(113, 7);
  const urls: string[] = [];
  const rows = await listAdminMusicTracks(client(fakeFetch(data, urls) as typeof fetch));
  assert.equal(rows.length, 113 * 7);
  assert.ok(urls.every((u) => u.length <= GATEWAY_URL_LIMIT));
  const codes = rows.map((r) => r.trackCode);
  assert.equal(new Set(codes).size, codes.length, "track codes unique");
  assert.deepEqual(codes, [...codes].sort((a, b) => a.localeCompare(b, "ru")));
  assert.ok(rows.every((r) => !r.artistName.includes("не найден")));
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "track ids unique");

  // Stable: a second load returns same id ↔ code mapping.
  const again = await listAdminMusicTracks(client(fakeFetch(data, []) as typeof fetch));
  assert.deepEqual(
    again.map((r) => [r.id, r.trackCode]),
    rows.map((r) => [r.id, r.trackCode]),
  );
}

// Empty registry → empty list, no error.
{
  const rows = await listAdminMusicTracks(
    client(fakeFetch({ authors: [], practices: [], audio: [] }, []) as typeof fetch),
  );
  assert.deepEqual(rows, []);
}

// Gateway failure still surfaces as an error (page shows error state).
{
  const failing = (async () => new Response("bad", { status: 502 })) as typeof fetch;
  await assert.rejects(() => listAdminMusicTracks(client(failing)));
}

console.log("admin-music-tracks-registry-unit: ok");
