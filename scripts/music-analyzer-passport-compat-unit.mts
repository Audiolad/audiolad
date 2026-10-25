import assert from "node:assert/strict";
import { buildFeatures } from "../src/lib/music-analyzer-runs/features.mjs";
import { readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
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
// Existing passports without feature metadata keep their historical structured fields.
const oldStored = storedFactsFromStructured(readMusicAnalyzerStructuredFacts(withheldInput));
assert.equal(oldStored.genres.length, 3);
assert.equal(oldStored.styles.length, 3);
assert.deepEqual(parseStoredStructuredFacts(oldStored), oldStored);

assert.equal(collectAnalyzerDocuments({ "track.json": { analysis: { analyzer_version: "music-analyzer-0.1", taxonomy_version: "0.1" } } }).hints.analyzerVersion, "music-analyzer-0.1");
const env = analyzerChildEnv({ NODE_ENV: "test", SUPABASE_SERVICE_ROLE_KEY: "do-not-pass", MUSIC_ANALYZER_CLAP_BACKEND: "hf" }, "/test/.venv-v03-clap/bin/python", "/test/models");
assert.equal(env.HF_HUB_OFFLINE, "1");
assert.equal(env.TRANSFORMERS_OFFLINE, "1");
assert.equal(env.MUSIC_ANALYZER_CHECKPOINT_DIR, "/test/models");
assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(env.MUSIC_ANALYZER_CLAP_BACKEND, undefined);
console.log("Совместимость паспортов: проверки пройдены.");
