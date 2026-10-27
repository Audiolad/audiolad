import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOverrides, buildFeatures, readFeatures } from "../src/lib/music-analyzer-runs/features.mjs";

const legacy = {
  technical: { energy: 0.4, bpm: 90, rms_db: -12 },
  genres: [{ label: "Jazz", average: 0.3 }],
  instruments: [{ label: "Piano", average: 0.4 }],
  moods: [{ label: "Calm", average: 0.3 }],
  vocal: { type: "mixed", scores: Object.fromEntries(Object.entries({ instrumental: 0.65, vocal: 0.1, spoken_word: 0.1, mixed: 0.2 })
    .map(([id, average]) => [id, { average }])) },
};
const evidence = type => ({ rule: "panns-voice:1", model: "Cnn14_mAP=0.431.pth", status: "ok", type,
  confidence_label: "medium", windows: [{ Speech: 0.9 }], reason: "test mock" });

test("AudioSet roles survive build and saved-read projection without changing other features", () => {
  const local = { energy_0_100: 40, rhythm_salience: 0.7, onset_density: 1.1, dynamic_spread_db: 6 };
  const original = buildFeatures(legacy, local);
  for (const role of ["instrumental", "vocal", "spoken", "mixed"]) {
    const normalized = { ...legacy, vocal: { ...legacy.vocal, type: role, detector: evidence(role) } };
    const snapshot = structuredClone(normalized);
    const set = buildFeatures(normalized, local);
    assert.equal(set.features.vocal_role.value, role);
    assert.equal(set.features.vocal_role.confidence, null); // Model scores are not calibrated probabilities.
    assert.equal(set.features.vocal_role.status, "candidate");
    assert.equal(readFeatures({ ...normalized, analysis_features_v1: set }).features.vocal_role.value, role);
    const ignored = new Set(["vocal_role", "speech"]); // speech diagnostic references the primary voice type.
    for (const key of Object.keys(original.features).filter(k => !ignored.has(k))) {
      assert.deepEqual(set.features[key], original.features[key], key);
    }
    assert.deepEqual(normalized, snapshot);
  }
});

test("Unavailable, ambiguous and malformed detector evidence cannot fall back to a confident CLAP label", () => {
  assert.equal(buildFeatures(legacy).features.vocal_role.value, "instrumental");
  for (const detector of [null, {}, { ...evidence("vocal"), rule: "future" },
    { ...evidence("vocal"), status: "unavailable" }, { ...evidence("vocal"), confidence_label: "low" },
    { ...evidence("vocal"), model: "wrong" }, { ...evidence("vocal"), windows: [] },
    { ...evidence("unknown"), status: "uncertain" }, evidence("spoken")]) {
    const normalized = { ...legacy, vocal: { ...legacy.vocal, type: "vocal", detector } };
    assert.equal(buildFeatures(normalized).features.vocal_role.value, null);
  }
});

test("Manual voice correction retains priority when reading a saved passport", () => {
  const normalized = { ...legacy, vocal: { ...legacy.vocal, type: "vocal", detector: evidence("vocal") } };
  const automatic = buildFeatures(normalized, { energy_0_100: 40 });
  const manual = applyOverrides(automatic, [{ id: 1, patch: { vocal_role: "spoken" } }]);
  assert.equal(readFeatures({ ...normalized, analysis_features_v1: manual }).features.vocal_role.value, "spoken");
  assert.equal(applyOverrides(automatic, [{ id: 1, patch: { vocal_role: "spoken" } }, { id: 2, patch: { vocal_role: null } }])
    .features.vocal_role.value, "vocal");
});
