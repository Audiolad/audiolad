import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { filterAgreementSubjects } from "../src/lib/business-admission/agreement-list";
import { sectorChecked, sectorInherited, sectorNextValue } from "../src/lib/business-admission/sectors";
import { BUSINESS_SPACE_IDS } from "../src/lib/business-workspace/spaces";
import { restrictSoundQueueToAgreement, type SoundReviewRow } from "../src/lib/business/track-sound-review";

const artistAllowed = { artist: true, album: null };
assert.equal(sectorChecked(artistAllowed), true);
assert.equal(sectorInherited(artistAllowed), true);
assert.equal(sectorNextValue(artistAllowed, false), false);
assert.equal(sectorNextValue(artistAllowed, true), true);
assert.equal(sectorNextValue({ artist: true, album: false }, false), undefined);
assert.equal(sectorNextValue({ artist: false, album: null }, false), undefined);
assert.equal(sectorNextValue({ artist: true, album: true }, true, true), null);
assert.equal(sectorNextValue({ artist: null, album: null }, true), true);

const artists = [{ id: "jazz", name: "Джаз" }, { id: "hide", name: "Скрытый" }];
const albums = [{ id: "al", title: "Вечер", authorId: "jazz" }, { id: "hid", title: "Тихий", authorId: "hide" }];
const hidden = new Set(["hide"]);
const visible = filterAgreementSubjects({
  kind: "artist", artists, albums, acceptedAuthorIds: new Set(["jazz", "hide"]),
  query: "", direction: null, decision: null, directions: [{ key: "cafe" }], decisions: [],
  hiddenAuthorIds: hidden, offset: 0, limit: 20,
});
assert.deepEqual(visible.rows.map((row) => row.id), ["jazz"]);
const onlyHidden = filterAgreementSubjects({
  kind: "album", artists, albums, acceptedAuthorIds: new Set(["jazz", "hide"]),
  query: "", direction: null, decision: null, directions: [{ key: "cafe" }], decisions: [],
  hiddenAuthorIds: hidden, hiddenOnly: true, offset: 0, limit: 20,
});
assert.deepEqual(onlyHidden.rows.map((row) => row.id), ["hid"]);

const row = (id: string, artist: string): SoundReviewRow => ({
  id, title: id, artist_id: artist, artist, album_id: "al", album: "Вечер", duration_seconds: 1,
  spaces: ["cafe"], audio_identity: "[]", status: "unchecked", reason: null, reviewed_at: null, reviewed_by: null,
});
const queue = restrictSoundQueueToAgreement([row("a", "jazz"), row("b", "hide")], new Set(["jazz", "hide"]), { hiddenAuthorIds: hidden });
assert.deepEqual(queue.rows.map((item) => item.id), ["a"]);

const migration = readFileSync(new URL("../supabase/migrations/20270203120000_business_four_sectors_hide_artists.sql", import.meta.url), "utf8");
for (const key of ["cafe", "spa", "retail", "fitness"]) assert.equal(BUSINESS_SPACE_IDS.includes(key as typeof BUSINESS_SPACE_IDS[number]), true);
assert.match(migration, /Кафе, кофейни, рестораны/);
assert.match(migration, /Спа и массаж/);
assert.match(migration, /Магазины, салоны красоты, барбершопы/);
assert.match(migration, /Фитнес-клубы/);
assert.match(migration, /sort_order = 10/);
assert.match(migration, /, 40, true\)/);
assert.match(migration, /set_business_artist_admission_hidden/);
assert.doesNotMatch(migration, /—/);
const page = readFileSync(new URL("../src/app/(platform)/admin/business-track-review/page.tsx", import.meta.url), "utf8");
assert.match(page, /listSectorAlbums/);
assert.match(page, /sectors\.directions/);
assert.doesNotMatch(page, /BUSINESS_SPACES/);
assert.match(readFileSync(new URL("../src/lib/business-app/onboarding-wizard.ts", import.meta.url), "utf8"), /Фитнес-клуб/);
assert.match(readFileSync(new URL("../src/lib/business-app/onboarding-wizard.ts", import.meta.url), "utf8"), /Барбершоп/);

console.log("business-four-sectors-unit: PASS");
