import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  queryRadioPassportFeatures, radioFeaturesFromPassport, radioNormalizedFromRun,
  type RadioPassportAttributeRow, type RadioPassportClient, type RadioPassportVersionRow,
} from "../src/lib/listen/album-radio-passport";

const version = (id: string, track: string, extra: Partial<RadioPassportVersionRow> = {}): RadioPassportVersionRow => ({
  id, audio_item_id: track, status: "active", sealed_at: "2026-11-01T00:00:00Z", ceased_at: null, analyzer_run_id: `run-${id}`,
  structured_fields: {
    genres: [{ label: "Jazz", score: 0.41 }, { label: "New Age", score: 0.39 }],
    styles: [{ label: "Lounge Jazz", score: 0.3 }, { label: "Spa Music", score: 0.29 }, { label: "Dark Jazz", score: 0.2 }],
    moods: [{ label: "warm", score: null }, { label: "relaxing", score: null }],
    instruments: [{ label: "saxophone", score: null }],
    sound_character: { label: "rich", score: null },
    bpm: { published: null, candidate: 82.7, raw: 165.4 }, energy: null,
  }, ...extra,
});
const run = (energy: number | null) => radioNormalizedFromRun({ id: "r",
  styles: [{ label: "Spa Music", research_only: true }, { label: "Lounge Jazz", research_only: false }],
  afv_schema: "audiolad-features:1",
  afv_energy: energy === null ? undefined : { value: energy, status: "candidate", source: "local:spectral-rhythm", confidence: null },
  vocal: {} });

// Labels: passport vocabulary, rank weights, withheld/research-only dropped.
const f = radioFeaturesFromPassport(version("v1", "t1"), [], run(42.5))!;
assert.deepEqual(f.genres.map((g) => g.label), ["jazz", "new age"]);
assert.deepEqual(f.styles.map((g) => g.label), ["lounge jazz"]);
assert.deepEqual(f.moods.map((g) => g.label), ["warm", "relaxing"]);
assert.equal(f.character, "rich");
assert.equal(f.energy, 42.5);
// Candidate / raw BPM are never read; unknown vocal stays unknown.
assert.equal(f.bpm, null);
assert.equal(f.vocal, null);
// Published BPM is used; a measured attribute with confidence >= 0.7 wins; low confidence ignored.
const pub = version("v2", "t2", { structured_fields: { ...(version("v", "t").structured_fields as object), bpm: { published: 75, candidate: 75 } } });
assert.equal(radioFeaturesFromPassport(pub, [], run(40))!.bpm, 75);
const attr = (key: string, value: number, confidence: number): RadioPassportAttributeRow => ({ passport_id: "v2", attribute_key: key, origin: "measured", value_numeric: value, value_text: null, confidence });
assert.equal(radioFeaturesFromPassport(pub, [attr("bpm", 96, 0.9)], run(40))!.bpm, 96);
assert.equal(radioFeaturesFromPassport(pub, [attr("bpm", 96, 0.5)], run(40))!.bpm, 75);
assert.equal(radioFeaturesFromPassport(pub, [attr("energy", 0.3, 0.8)], run(70))!.energy, 30);
assert.equal(radioFeaturesFromPassport(pub, [attr("energy", 0.3, 0.4)], run(70))!.energy, 70);
// Without its analyzer source the reader stays conservative (known research labels still dropped).
// Dark Jazz is withheld by rule even then; run-scoped research flags need the run (the query retries).
assert.ok(!radioFeaturesFromPassport(version("v3", "t3"), [], undefined)!.styles.some((s) => s.label === "dark jazz"));
assert.equal(radioFeaturesFromPassport(version("v3", "t3"), [], undefined)!.energy, null);
// Not active / unsealed / ceased → no passport.
assert.equal(radioFeaturesFromPassport(version("v4", "t4", { sealed_at: null }), [], run(40)), null);
assert.equal(radioFeaturesFromPassport(version("v4", "t4", { status: "superseded" }), [], run(40)), null);
assert.equal(radioFeaturesFromPassport(null), null);

// Batched query with a fake client: one versions request per 50 tracks, cached sealed versions skip run reads.
const calls: string[] = [];
const versions = Array.from({ length: 60 }, (_, i) => version(`q${i}`, `track-${i}`));
const client: RadioPassportClient = {
  from: (table) => ({
    select: (columns) => ({
      in: (column, values) => {
        calls.push(table);
        const rows = table === "music_passport_versions" ? versions.filter((v) => values.includes(v.audio_item_id))
          : table === "music_analyzer_runs" ? values.map((id) => ({ id, styles: [{ label: "Spa Music", research_only: true }], afv_schema: "audiolad-features:1", afv_energy: { value: 33 } }))
            : [];
        assert.ok(table !== "music_analyzer_runs" || !columns.includes("segments"));
        const result = Promise.resolve({ data: rows, error: null });
        return Object.assign(result, { eq: () => ({ is: () => ({ not: () => result }) }) });
      },
    }),
  }),
};
const ids = versions.map((v) => v.audio_item_id);
const first = await queryRadioPassportFeatures(client, [...ids, "no-passport"]);
assert.equal(first.size, 60);
assert.equal(first.get("track-1")!.energy, 33);
assert.ok(!first.has("no-passport"));
assert.equal(calls.filter((c) => c === "music_passport_versions").length, 2);
calls.length = 0;
await queryRadioPassportFeatures(client, ids);
assert.deepEqual([...new Set(calls)], ["music_passport_versions"]);

// Boundaries: no Business code, no analyzer execution, read-only.
const src = readFileSync("src/lib/listen/album-radio-passport.ts", "utf8");
assert.doesNotMatch(src, /business-app|execute|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
console.log("album radio passport reader: passed");
