import assert from "node:assert/strict";
import { resolvePlaylistQueueEntrySession } from "../src/lib/playlists/queue-entry-session";
import { resolveAlbumRadioEligible } from "../src/lib/listen/album-radio-eligibility";
import { readFileSync } from "node:fs";
import { createPendingConfirmedPlaysStore } from "../src/lib/analytics/pending-confirmed-plays-store";
import type { CatalogGlobalPlayerSession } from "../src/lib/listen/global-player-types";
import type { PlaylistQueueEntry } from "../src/lib/playlists/player-queue-types";

const entry: PlaylistQueueEntry = { kind: "audio_item", practiceId: "album", audioItemId: "track", fullOnly: true,
  authorSlug: "artist", productSlug: "album", title: "Трек", listenHref: "/listen/artist/album" };
const session = { albumRadioEligible: true, practiceId: "album", tracks: [{ id: "track" }, { id: "other" }], playbackMode: "full" } as CatalogGlobalPlayerSession;
let previewCalls = 0;
const fetchCatalog = async () => { previewCalls++; return { ok: true as const, session }; };
const denied = await resolvePlaylistQueueEntrySession(entry, { fromStart: true,
  fetchListen: async () => ({ ok: false, reason: "unavailable" }), fetchCatalog });
assert.equal(denied.ok, false);
assert.equal(previewCalls, 0);
for (const patch of [{ albumRadioEligible: false }, { playbackMode: "preview" as const }, { isAuthorPreview: true, albumRadioEligible: false }, { isAuthorPreview: true, albumRadioEligible: undefined }]) {
  const result = await resolvePlaylistQueueEntrySession(entry, { fromStart: true,
    fetchListen: async () => ({ ok: true, session: { ...session, ...patch } }), fetchCatalog });
  assert.equal(result.ok, false);
}
// t1437u: author member of a published, listed release (author_preview access) still gets the full radio track.
const own = await resolvePlaylistQueueEntrySession(entry, { fromStart: true,
  fetchListen: async () => ({ ok: true, session: { ...session, isAuthorPreview: true } }), fetchCatalog });
assert.ok(own.ok);
const full = await resolvePlaylistQueueEntrySession(entry, { fromStart: true,
  fetchListen: async () => ({ ok: true, session }), fetchCatalog });
assert.ok(full.ok);
assert.deepEqual(full.session.tracks.map((track) => track.id), ["track"]);
// Existing playlists still retain their established preview fallback.
await resolvePlaylistQueueEntrySession({ ...entry, fullOnly: false }, { fromStart: true,
  fetchListen: async () => ({ ok: false, reason: "unavailable" }), fetchCatalog });
assert.equal(previewCalls, 1);
const store = createPendingConfirmedPlaysStore();
const attribution = { playback_mode: "album_radio", radio_source_album_id: "source", radio_transition: true };
store.note({ practiceId: "album", trackId: "track", path: "/catalog", listeningContextId: 10, now: 10, playbackAttribution: attribution });
assert.deepEqual(store.list()[0].playbackAttribution, attribution);
// t1437u: author_preview eligibility – listed release and no unpublished audio_items.
const release = { id: "album", product_kind: "music", publication_class: "release", deleted_at: null, status: "published",
  is_catalog_listed: true, catalog_visibility: "public", published_at: "2026-01-01T00:00:00Z", scheduled_publish_at: null };
const fakeDb = (drafts: number | null, fail = false) => {
  const calls: string[] = [];
  const chain = { select: () => chain, eq: (k: string, v: string) => { calls.push(`${k}=${v}`); return chain; },
    neq: (k: string, v: string) => { calls.push(`${k}!=${v}`); return Promise.resolve(fail ? { count: null, error: { message: "x" } } : { count: drafts, error: null }); } };
  return { db: { from: (t: string) => { calls.push(t); return chain; } } as never, calls };
};
assert.equal(await resolveAlbumRadioEligible(fakeDb(0).db, release, "author_preview"), true);
assert.equal(await resolveAlbumRadioEligible(fakeDb(2).db, release, "author_preview"), false);
assert.equal(await resolveAlbumRadioEligible(fakeDb(0, true).db, release, "author_preview"), false);
const entitled = fakeDb(5);
assert.equal(await resolveAlbumRadioEligible(entitled.db, release, "entitled"), true);
assert.equal(entitled.calls.length, 0);
for (const patch of [{ catalog_visibility: "unlisted", is_catalog_listed: false }, { status: "draft" }, { deleted_at: "2026-01-02" }, { product_kind: "practice" }, { publication_class: "course" }]) {
  assert.equal(await resolveAlbumRadioEligible(fakeDb(0).db, { ...release, ...patch }, "author_preview"), false);
}
// Both session builders carry the server flag; radio candidates of an author session are published only.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
assert.match(src("src/lib/listen/page-shared.tsx"), /albumRadioEligible = await resolveAlbumRadioEligible\(supabase, practiceRow, access\.mode\)/);
assert.match(src("src/lib/listen/page-shared.tsx"), /albumRadioEligible=\{albumRadioEligible\}/);
assert.match(src("src/components/audio/ListenPageClient.tsx"), /isAuthorPreview,\n\s+albumRadioEligible,\n\s+requestAutoplay/);
assert.match(src("src/lib/listen/load-session-payload.ts"), /resolveAlbumRadioEligible\(supabase, practiceRow, access\.mode\)/);
assert.match(src("src/lib/listen/album-radio.server.ts"), /!result\.session\.isAuthorPreview \|\| published\.has\(track\.id\)/);
console.log("album radio access and delayed analytics: passed");
