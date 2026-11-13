import assert from "node:assert/strict";
import { resolvePlaylistQueueEntrySession } from "../src/lib/playlists/queue-entry-session";
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
console.log("album radio access and delayed analytics: passed");
