import assert from "node:assert/strict";
import {
  GET_MUSIC_PASSPORT_BASIC_RPC,
  UPSERT_MUSIC_PASSPORT_BASIC_RPC,
  measuredNumeric,
  musicPassportUsableForEngine,
  parseMusicPassportBasic,
} from "../src/lib/music-passport/contract";

const audioId = "dddddddd-dddd-4ddd-8ddd-dddddddddd01";

const empty = parseMusicPassportBasic({
  object: "music_passport_basic",
  audio_item_id: audioId,
  track_code: "AL-T-000000041",
  as_of: "2026-10-01T12:00:00.000Z",
  status: "NO_PASSPORT",
  passport: null,
});

assert.equal(musicPassportUsableForEngine(empty), false);
assert.equal(measuredNumeric(empty, "bpm"), null);
assert.equal(measuredNumeric(empty, "energy"), null);
assert.notEqual(measuredNumeric(empty, "bpm"), 0);

const present = parseMusicPassportBasic({
  object: "music_passport_basic",
  audio_item_id: audioId,
  track_code: "AL-T-000000041",
  as_of: "2026-10-01T12:00:00.000Z",
  status: "HAS_PASSPORT",
  passport: {
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    analysis_version: "stage1.v1",
    observed_at: "2026-10-01T11:00:00.000Z",
    activated_at: "2026-10-01T12:00:00.000Z",
    ceased_at: null,
    measured: {
      bpm: {
        value_numeric: 96.5,
        value_text: null,
        confidence: 0.91,
        provenance: "analyzer",
        source_ref: "stage1",
      },
      mood: [
        {
          value_numeric: null,
          value_text: "calm",
          confidence: 0.64,
          provenance: "analyzer",
          source_ref: null,
        },
      ],
    },
    interpreted: {
      mood: [
        {
          value_numeric: null,
          value_text: "warm",
          confidence: null,
          provenance: "manual",
          source_ref: "operator-note",
        },
      ],
    },
  },
});

assert.equal(musicPassportUsableForEngine(present), true);
assert.equal(measuredNumeric(present, "bpm"), 96.5);
assert.equal(measuredNumeric(present, "energy"), null);
assert.equal(present.passport?.measured.mood && Array.isArray(present.passport.measured.mood)
  ? present.passport.measured.mood[0].value_text
  : null, "calm");
assert.equal(present.passport?.interpreted.mood && Array.isArray(present.passport.interpreted.mood)
  ? present.passport.interpreted.mood[0].value_text
  : null, "warm");

assert.throws(
  () =>
    parseMusicPassportBasic({
      audio_item_id: audioId,
      track_code: "AL-T-000000041",
      as_of: "2026-10-01T12:00:00.000Z",
      review_status: "REVIEW_REQUIRED",
      active_grants: [],
    }),
  /music_passport_payload_invalid/,
);

assert.throws(
  () =>
    parseMusicPassportBasic({
      object: "music_passport_basic",
      audio_item_id: audioId,
      track_code: "AL-T-000000041",
      as_of: "2026-10-01T12:00:00.000Z",
      status: "HAS_PASSPORT",
      eligible: true,
      passport: null,
    }),
  /music_passport_payload_invalid/,
);

assert.throws(
  () =>
    parseMusicPassportBasic({
      object: "music_passport_basic",
      audio_item_id: audioId,
      track_code: "AL-T-000000041",
      as_of: "2026-10-01T12:00:00.000Z",
      status: "NO_PASSPORT",
      passport: { id: "x" },
    }),
  /music_passport_payload_invalid/,
);

assert.equal(GET_MUSIC_PASSPORT_BASIC_RPC, "get_music_passport_basic");
assert.equal(UPSERT_MUSIC_PASSPORT_BASIC_RPC, "upsert_music_passport_basic");
assert.notEqual(GET_MUSIC_PASSPORT_BASIC_RPC, "get_music_rights_passport_basic");

console.log("music-passport-contract-unit: ok");
