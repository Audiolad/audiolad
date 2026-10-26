import { readFileSync } from "node:fs";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MusicPassport } from "../src/components/music-passport/MusicPassport";
import assert from "node:assert/strict";
import { MUSIC_ANALYZER_ENERGY_PUBLIC, applyOverrides, buildFeatures, readFeatures } from "../src/lib/music-analyzer-runs/features.mjs";
import { readMusicAnalyzerFeatures, readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
import { albumPassportPromptFacts, albumPassportSummaryLines, buildAlbumPassportDraft, parseStoredStructuredFacts, attributesFromStructuredFacts, storedFactsFromStructured } from "../src/lib/music-passport/album-aggregate";
import { collectAnalyzerDocuments } from "../src/lib/music-analyzer-runs/analyze-output";
import { analyzerChildEnv } from "../src/lib/music-analyzer-runs/python-plan";

const legacy = {
  technical: { bpm: 90, bpm_confidence: 0.8, energy: 0.4, lufs: -18, duration_s: 180 },
  genres: [{ label: "dark_jazz", score: 0.9 }, { label: "ambient", score: 0.6 }],
  moods: [{ label: "calm", score: 0.8 }],
};
const before = readMusicAnalyzerPassport({ normalized: legacy });
const normalized = { ...legacy, analysis_features_v1: buildFeatures(legacy, { rhythm_salience: 0.2, energy_0_100: 55 }) };
const after = readMusicAnalyzerPassport({ normalized });
assert.deepEqual(after.bpmDisplay, before.bpmDisplay);
assert.deepEqual(after.technical, before.technical);
assert.deepEqual(after.genres, before.genres); // Старые поля не переписаны, новый UI читает features.
assert.equal(after.features?.features.tempo.value.rhythm, "uncertain");
assert.equal(readMusicAnalyzerStructuredFacts(normalized).energy, 0.4);
const facts = readMusicAnalyzerStructuredFacts(normalized);
assert.equal(facts.genres.some(row => row.label === "dark_jazz"), false);
// Preliminary DSP energy is public; historical technical.energy remains unchanged.
assert.equal(MUSIC_ANALYZER_ENERGY_PUBLIC, true);
assert.equal(after.features?.features.energy_0_100.value, 55);
assert.equal(facts.analysisFeatures?.features.energy_0_100.value, 55);
assert.equal(readFeatures(normalized)?.features.energy_0_100.value, 55);
const internalOnly = { analysis_features_v1: buildFeatures({}, { energy_0_100: 82 }) };
const publicFacts = readMusicAnalyzerStructuredFacts(internalOnly);
const publicPassport = readMusicAnalyzerPassport({ normalized: internalOnly });
const publicStored = storedFactsFromStructured(publicFacts);
const publicAlbum = buildAlbumPassportDraft({ succeeded: [{ audioItemId: "energy-track", passportId: "energy-passport", runId: "energy-run",
  analyzerVersion: "test", analyzerGitCommit: null, facts: publicStored }], failed: [] });
for (const output of [publicPassport, publicFacts]) {
  assert.match(JSON.stringify(output), /energy_0_100/);
}
// Album storage retains its historical 0..1 contract; DSP features do not
// silently become a measured attribute or a calibrated recommendation signal.
for (const output of [publicStored, publicAlbum, attributesFromStructuredFacts(publicFacts, "energy-test"),
  albumPassportSummaryLines(publicAlbum), albumPassportPromptFacts(publicAlbum)]) {
  assert.doesNotMatch(JSON.stringify(output), /energy_0_100|82/);
}
for (const mode of ["full", "product"] as const) {
  // Full and product passports both expose the preliminary label and calibration hint.
  const html = renderToStaticMarkup(createElement(MusicPassport, {
    mode, snapshot: { version: "test", commit: null }, passport: { ...publicPassport, features: internalOnly.analysis_features_v1 },
    header: { filename: "test.wav", analyzedAt: null, analyzerVersion: "test", statusLabel: "Готово", fileVersion: null },
    provenance: { sha256: null, analyzerGitCommit: null, analyzerContentCommit: null, modelCheckpoint: null,
      device: null, taxonomy: null, prompt: null },
  }));
  assert.match(html, /Энергия — предварительная оценка/);
  assert.match(html, /82 \/ 100/);
  assert.match(html, /калибруется/);
}
assert.equal(publicFacts.energy, null);
assert.equal(publicStored.energy, null);
assert.equal(storedFactsFromStructured(facts).energy, 0.4);
assert.equal(readFeatures(internalOnly)?.features.energy_0_100.value, 82);

const attributes = attributesFromStructuredFacts(facts, "analyzer-run:test");
assert.equal(attributes.find(a => a.attribute_key === "mood")?.origin, "interpreted");
assert.equal(attributes.find(a => a.attribute_key === "mood")?.confidence, null);
assert.equal(attributesFromStructuredFacts(readMusicAnalyzerStructuredFacts(legacy), "old").find(a => a.attribute_key === "mood")?.origin, "measured");
assert.ok(Buffer.byteLength(JSON.stringify(storedFactsFromStructured(facts))) < 20000);
// Exercise the materialization -> album -> display/description chain for both lists.
const withheldInput = {
  genres: [{ label: "Dark Jazz", score: 0.99 }, { label: "Relaxation Music", score: 0.9, research_only: true }, { label: "ambient", score: 0.6 }],
  styles: [{ label: "dark_jazz", score: 0.99 }, { label: "Relaxation Music", score: 0.9, research_only: true }, { label: "Drone", score: 0.5 }],
};
const featureFacts = buildFeatures(withheldInput);
const safeFacts = readMusicAnalyzerStructuredFacts({ ...withheldInput, analysis_features_v1: featureFacts });
assert.deepEqual(safeFacts.genres, [{ label: "ambient", score: 0.6 }]);
assert.deepEqual(safeFacts.styles, [{ label: "Drone", score: 0.5 }]);
const stored = storedFactsFromStructured(safeFacts);
assert.deepEqual(parseStoredStructuredFacts(stored), stored);
const album = buildAlbumPassportDraft({ succeeded: [{ audioItemId: "track", passportId: "passport", runId: "run",
  analyzerVersion: "test", analyzerGitCommit: null, facts: stored }], failed: [] });
assert.deepEqual(album.genreProfile.items.map(item => item.label), ["ambient"]);
assert.deepEqual(album.styleProfile.items.map(item => item.label), ["Drone"]);
for (const output of [JSON.stringify(stored), JSON.stringify(attributesFromStructuredFacts(safeFacts, "test")),
  JSON.stringify(album), albumPassportSummaryLines(album).join("\n"), albumPassportPromptFacts(album)]) {
  assert.doesNotMatch(output, /dark[ _-]*jazz|Relaxation Music/i);
  assert.match(output, /ambient/);
}
assert.match(albumPassportPromptFacts(album), /Drone/);
// No fallback to raw labels if the versioned features withheld every candidate.
const allWithheld = { genres: withheldInput.genres.slice(0, 2), styles: withheldInput.styles.slice(0, 2) };
const emptyFacts = readMusicAnalyzerStructuredFacts({ ...allWithheld, analysis_features_v1: buildFeatures(allWithheld) });
assert.deepEqual(emptyFacts.genres, []);
assert.deepEqual(emptyFacts.styles, []);
// Legacy passports apply the same withholding rule without feature metadata.
const oldStored = storedFactsFromStructured(readMusicAnalyzerStructuredFacts(withheldInput));
assert.equal(oldStored.genres.length, 1);
assert.equal(oldStored.styles.length, 1);
assert.deepEqual(parseStoredStructuredFacts(oldStored), oldStored);

assert.equal(collectAnalyzerDocuments({ "track.json": { analysis: { analyzer_version: "music-analyzer-0.1", taxonomy_version: "0.1" } } }).hints.analyzerVersion, "music-analyzer-0.1");
const env = analyzerChildEnv({ NODE_ENV: "test", SUPABASE_SERVICE_ROLE_KEY: "do-not-pass", MUSIC_ANALYZER_CLAP_BACKEND: "hf" }, "/test/.venv-v03-clap/bin/python", "/test/models");
assert.equal(env.HF_HUB_OFFLINE, "1");
assert.equal(env.TRANSFORMERS_OFFLINE, "1");
assert.equal(env.MUSIC_ANALYZER_CHECKPOINT_DIR, "/test/models");
assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(env.MUSIC_ANALYZER_CLAP_BACKEND, undefined);
console.log("Совместимость паспортов: проверки пройдены.");

// Exercise both handlers without importing auth/storage or contacting a database.
const routeSource = readFileSync(new URL("../src/app/api/music-analyzer/runs/[id]/features/route.ts", import.meta.url), "utf8");
const routeModule = { exports: {} as Record<string, (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>> };
const routeMocks = {
  requireMusicLabApiAccess: async () => ({ ok: true, actor: { userId: "test" } }),
  musicLabJson: (body: unknown, status = 200) => Response.json(body, { status }),
  getRunFeatures: () => { throw new Error("storage must not be reached"); },
  appendRunFeatureOverride: () => { throw new Error("storage must not be reached"); },
};
new Function("require", "exports", ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(() => routeMocks, routeModule.exports);
for (const method of ["GET", "POST"]) {
  for (const id of ["bad-id", "", "12345678-1234-1234-1234-12345678901z"]) {
    const response = await routeModule.exports[method](new Request("http://localhost/api/features", {
      method, headers: { origin: "http://localhost" },
    }), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_run_id" });
  }
}
console.log("Features API: invalid UUID rejected before storage (GET/POST).");

// Contract fixtures, not claimed to be saved runs or an audio accuracy evaluation.
const legacyTags = {
  moods: [{ label: "warm", average: 0.42 }],
  instruments: [{ label: "organ", average: 0.51 }],
  sound_character: [{ label: "soft", average: 0.4 }],
};
const renderPassport = (n: unknown, effective?: ReturnType<typeof buildFeatures>) => {
  const passport = readMusicAnalyzerPassport({ normalized: n });
  if (effective) passport.features = effective;
  return renderToStaticMarkup(createElement(MusicPassport, {
    mode: "full", passport, snapshot: { version: null, commit: null },
    header: { filename: "contract-fixture.wav", analyzedAt: null, analyzerVersion: null, statusLabel: "Готово", fileVersion: 1 },
    provenance: { sha256: null, analyzerGitCommit: null, analyzerContentCommit: null, modelCheckpoint: null, device: null, taxonomy: null, prompt: null },
  }));
};
for (const value of [null, [], {}, "wrong", [null, 3, {}, { label: 42 }, { label: " " }]]) {
  const set = buildFeatures(legacyTags, { energy_0_100: 62, rhythm_salience: 0.8, dynamic_spread_db: 5 });
  set.features.mood.value = value;
  set.features.instruments.value = value;
  const n = { ...legacyTags, analysis_features_v1: set };
  const original = structuredClone(n);
  for (const output of [renderPassport(n), JSON.stringify(readMusicAnalyzerStructuredFacts(n))]) {
    for (const label of ["warm", "organ", "soft"]) assert.match(output, new RegExp(label));
  }
  assert.match(renderPassport(n), /62 \/ 100/);
  assert.match(renderPassport(n), /0.8 \/ 1/);
  assert.match(renderPassport(n), /5 дБ/);
  assert.deepEqual(n, original);
}
assert.match(renderPassport(legacyTags), /organ/);
const featureOnly = buildFeatures({ moods: ["bright"], instruments: ["piano"] });
const featureOnlyInput = { analysis_features_v1: featureOnly };
assert.match(renderPassport(featureOnlyInput), /bright/);
assert.match(renderPassport(featureOnlyInput), /piano/);
assert.deepEqual(readMusicAnalyzerStructuredFacts(featureOnlyInput).instruments, [{ label: "piano", score: null }]);
const held = buildFeatures(legacyTags);
for (const key of ["mood", "instruments"]) held.features[key].value = [{ label: "Hidden", status: "withheld" }];
assert.doesNotMatch(renderPassport({ ...legacyTags, analysis_features_v1: held }), /warm|organ|Hidden/);
assert.deepEqual(readMusicAnalyzerStructuredFacts({ ...legacyTags, analysis_features_v1: held }).moods, []);
const parentHeld = structuredClone(held);
parentHeld.features.mood = { ...parentHeld.features.mood, value: null, status: "withheld" as typeof parentHeld.features.mood.status };
assert.doesNotMatch(renderPassport({ ...legacyTags, analysis_features_v1: parentHeld }), /warm/);
const researchConflict = { ...legacyTags, analysis_features_v1: buildFeatures(legacyTags) };
researchConflict.analysis_features_v1.features.mood.value = [{ label: "warm", research_only: true }];
assert.deepEqual(readMusicAnalyzerStructuredFacts(researchConflict).moods, []);
assert.doesNotMatch(renderPassport(researchConflict), /warm/);
const automatic = buildFeatures(legacyTags);
const originalAutomatic = structuredClone(automatic);
const effective = applyOverrides(automatic, [{ id: 1, patch: { mood: ["bright"], instruments: ["piano"], vocal_role: "instrumental" } }]);
const manualHtml = renderPassport({ ...legacyTags, analysis_features_v1: automatic }, effective);
assert.match(manualHtml, /bright/); assert.match(manualHtml, /piano/); assert.match(manualHtml, /инструментал/);
assert.doesNotMatch(manualHtml, /warm|organ/);
const cleared = applyOverrides(automatic, [{ id: 2, patch: { mood: [], instruments: [] } }]);
assert.doesNotMatch(renderPassport({ ...legacyTags, analysis_features_v1: automatic }, cleared), /warm|organ/);
assert.match(renderPassport({}), /не определено/);
assert.deepEqual(automatic, originalAutomatic);
console.log("E20D8EB7: fallback, feature-only, withholding, ручной приоритет и DSP совместимость пройдены.");

const recoveredStored = storedFactsFromStructured(readMusicAnalyzerStructuredFacts(featureOnlyInput));
const recoveredAlbum = buildAlbumPassportDraft({ succeeded: [{ audioItemId: "fixture", passportId: "fixture", runId: "fixture",
  analyzerVersion: "test", analyzerGitCommit: null, facts: recoveredStored }], failed: [] });
assert.match(albumPassportPromptFacts(recoveredAlbum), /bright/);
assert.match(albumPassportPromptFacts(recoveredAlbum), /piano/);

// The features endpoint must not overwrite the safe first render with unsafe saved tags.
const overrideModule = { exports: {} as { getRunFeatures: (id: string) => Promise<{ automatic: ReturnType<typeof buildFeatures>; effective: ReturnType<typeof buildFeatures> }> } };
let patches: { id: number; patch: unknown }[] = [];
const overrideMocks = {
  applyOverrides, readMusicAnalyzerFeatures,
  getMusicAnalyzerRun: async () => ({ status: "succeeded", normalized_json: researchConflict }),
  createServiceRoleClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({
    range: async () => ({ data: patches, error: null }),
  }) }) }) }) }),
};
new Function("require", "exports", ts.transpileModule(readFileSync(new URL(
  "../src/lib/music-analyzer-runs/feature-overrides.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(() => overrideMocks, overrideModule.exports);
const safeApi = await overrideModule.exports.getRunFeatures("fixture");
assert.doesNotMatch(renderPassport(researchConflict, safeApi.effective), /warm/);
patches = [{ id: 3, patch: { mood: ["bright"], vocal_role: "instrumental" } }];
const manualApi = await overrideModule.exports.getRunFeatures("fixture");
assert.match(renderPassport(researchConflict, manualApi.effective), /bright/);
assert.equal(manualApi.effective.features.vocal_role.value, "instrumental");
assert.equal(manualApi.automatic.features.vocal_role.value, null);
