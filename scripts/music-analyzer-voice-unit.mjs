import assert from "node:assert/strict";
import { test } from "node:test";
import { featureDisplayRows } from "../src/lib/music-analyzer-runs/feature-display.mjs";
import { VOCAL_NATURE_REASON, VOCAL_UNKNOWN_LABEL, applyOverrides, buildFeatures, readFeatures } from "../src/lib/music-analyzer-runs/features.mjs";
import { isInstrumentalForBusiness, selectInstrumentalForBusiness } from "../src/lib/music-analyzer-runs/vocal-eligibility.mjs";

const legacy = {
  technical: { energy: 0.4, bpm: 90, rms_db: -12 },
  genres: [{ label: "Jazz", average: 0.3 }],
  instruments: [{ label: "Piano", average: 0.4 }],
  moods: [{ label: "Calm", average: 0.3 }],
  vocal: { type: "mixed", scores: Object.fromEntries(Object.entries({ instrumental: 0.65, vocal: 0.1, spoken_word: 0.1, mixed: 0.2 })
    .map(([id, average]) => [id, { average }])) },
};
const evidence = (type, rule = "panns-voice:2", extra = {}) => ({
  rule, model: "Cnn14_mAP=0.431.pth", status: "ok", type,
  confidence_label: "medium", windows: [{ Speech: 0.9 }], reason: "test mock", ...extra,
});
const withDetector = (type, rule = "panns-voice:2", extra = {}) => ({
  ...legacy,
  vocal: { ...legacy.vocal, type, detector: evidence(type, rule, extra) },
});
const role = (normalized) => buildFeatures(normalized).features.vocal_role;

test("v2 instrumental is accepted; v1 instrumental is not; other features stay put", () => {
  const local = { energy_0_100: 40, rhythm_salience: 0.7, onset_density: 1.1, dynamic_spread_db: 6 };
  const original = buildFeatures(legacy, local);
  const accepted = [
    ["instrumental", "panns-voice:2"],
    ["vocal", "panns-voice:1"],
    ["vocal", "panns-voice:2"],
    ["spoken", "panns-voice:1"],
    ["mixed", "panns-voice:1"],
  ];
  for (const [type, rule] of accepted) {
    const normalized = withDetector(type, rule);
    const snapshot = structuredClone(normalized);
    const set = buildFeatures(normalized, local);
    assert.equal(set.features.vocal_role.value, type, `${rule} ${type}`);
    assert.equal(set.features.vocal_role.confidence, null);
    assert.equal(set.features.vocal_role.status, "candidate");
    assert.equal(set.features.vocal_role.source, `analyzer:vocal.detector:${rule}`);
    assert.equal(readFeatures({ ...normalized, analysis_features_v1: set }).features.vocal_role.value, type);
    const ignored = new Set(["vocal_role", "speech"]);
    for (const key of Object.keys(original.features).filter(k => !ignored.has(k))) {
      assert.deepEqual(set.features[key], original.features[key], key);
    }
    assert.deepEqual(normalized, snapshot);
  }
  const v1Instrumental = withDetector("instrumental", "panns-voice:1");
  const withheld = buildFeatures(v1Instrumental, local);
  assert.equal(withheld.features.vocal_role.value, null);
  assert.equal(withheld.features.vocal_role.source, "analyzer:vocal.detector:panns-voice:1");
  withheld.features.vocal_role = { ...withheld.features.vocal_role, value: "instrumental", status: "candidate" };
  assert.equal(readFeatures({ ...v1Instrumental, analysis_features_v1: withheld }).features.vocal_role.value, null);
});

test("Unavailable, ambiguous, v1 instrumental and nature cannot fall back to a confident CLAP label", () => {
  assert.equal(buildFeatures(legacy).features.vocal_role.value, "instrumental");
  assert.equal(buildFeatures(legacy).features.vocal_role.source, "analyzer:vocal.scores:conservative-v2");
  for (const detector of [null, {}, { ...evidence("vocal"), rule: "panns-voice:3" },
    { ...evidence("vocal"), status: "unavailable" }, { ...evidence("vocal"), confidence_label: "low" },
    { ...evidence("vocal"), model: "wrong" }, { ...evidence("vocal"), windows: [] },
    { ...evidence("unknown"), status: "uncertain" }, evidence("spoken"),
    evidence("instrumental", "panns-voice:1"),
    evidence("unknown", "panns-voice:2", { status: "uncertain", reason: "non_music_nature", non_music: true }),
    evidence("unknown", "panns-voice:2", { status: "uncertain", reason: "vocal_veto" })]) {
    const normalized = { ...legacy, vocal: { ...legacy.vocal, type: "vocal", detector } };
    const vocal = role(normalized);
    assert.equal(vocal.value, null);
    assert.equal(vocal.source.startsWith("analyzer:vocal.detector:"), true);
    assert.equal(vocal.source.includes("conservative"), false);
  }
  const nature = role(withDetector("unknown", "panns-voice:2", { status: "uncertain", reason: "non_music_nature", non_music: true }));
  assert.equal(nature.reason, VOCAL_NATURE_REASON);
  const unknownRule = role({ ...legacy, vocal: { ...legacy.vocal, type: "vocal", detector: { ...evidence("vocal"), rule: "panns-voice:3" } } });
  assert.equal(unknownRule.source, "analyzer:vocal.detector:invalid");
});

test("Manual voice correction retains priority when reading a saved passport", () => {
  const normalized = withDetector("vocal", "panns-voice:2");
  const automatic = buildFeatures(normalized, { energy_0_100: 40 });
  const manual = applyOverrides(automatic, [{ id: 1, patch: { vocal_role: "spoken" } }]);
  assert.equal(readFeatures({ ...normalized, analysis_features_v1: manual }).features.vocal_role.value, "spoken");
  assert.equal(applyOverrides(automatic, [{ id: 1, patch: { vocal_role: "spoken" } }, { id: 2, patch: { vocal_role: null } }])
    .features.vocal_role.value, "vocal");
});

test("Business instrumental guard: only v2 or a manual label", () => {
  const feature = (value, source, status = "candidate") => ({
    value, source, status, confidence: null, model_version: "test", origin: "interpreted", reason: null,
  });
  const nature = role(withDetector("unknown", "panns-voice:2", { status: "uncertain", reason: "non_music_nature", non_music: true }));
  const v2 = role(withDetector("instrumental"));
  const manual = applyOverrides(buildFeatures(legacy), [{ id: 7, patch: { vocal_role: "instrumental" } }]).features.vocal_role;
  assert.equal(nature.value, null);
  assert.equal(v2.value, "instrumental");
  assert.equal(v2.source, "analyzer:vocal.detector:panns-voice:2");
  assert.equal(manual.value, "instrumental");
  assert.equal(manual.source, "manual:7");
  assert.equal(manual.status, "manual");

  const samples = {
    vocal: feature("vocal", "analyzer:vocal.detector:panns-voice:2"),
    unknown: feature("unknown", "analyzer:vocal.detector:panns-voice:2", "unknown"),
    null: null,
    v1: feature("instrumental", "analyzer:vocal.detector:panns-voice:1"),
    clap: feature("instrumental", "analyzer:vocal.scores:conservative-v2"),
    nature,
    mixed: feature("mixed", "analyzer:vocal.detector:panns-voice:2"),
    spoken: feature("spoken", "analyzer:vocal.detector:panns-voice:2"),
    v2,
    manual,
  };
  for (const key of ["vocal", "unknown", "null", "v1", "clap", "nature", "mixed", "spoken"]) {
    assert.equal(isInstrumentalForBusiness(samples[key]), false, key);
  }
  assert.equal(isInstrumentalForBusiness(samples.v2), true);
  assert.equal(isInstrumentalForBusiness(samples.manual), true);
  assert.deepEqual(selectInstrumentalForBusiness(Object.keys(samples), (key) => samples[key]), ["v2", "manual"]);

  const rows = featureDisplayRows(buildFeatures(withDetector("unknown", "panns-voice:2", { status: "uncertain", reason: "non_music_nature" }), { energy_0_100: 10 }));
  const shown = rows.find((row) => row.key === "vocal_role");
  assert.equal(shown.value, "Не определено");
  assert.equal(shown.value, VOCAL_UNKNOWN_LABEL);
  assert.equal(shown.reason, VOCAL_NATURE_REASON);
  assert.equal(shown.value.includes("—"), false);
  assert.equal(shown.reason.includes("—"), false);
});
