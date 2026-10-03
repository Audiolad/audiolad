import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon";
import {
  JAZZ_RELAX_AUTHOR_ID,
  JAZZ_RELAX_AUTHOR_SLUG,
  isJazzRelaxAuthor,
} from "../src/lib/authors/jazz-relax";
import { readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
import {
  ALBUM_PASSPORT_AGGREGATION_VERSION,
  albumPassportPromptFacts,
  attributesFromStructuredFacts,
  buildAlbumPassportDraft,
  nextDescriptionAlbumBinding,
  sanitizeAnalysisVersion,
  storedFactsFromStructured,
  type AlbumTrackSnapshot,
} from "../src/lib/music-passport/album-aggregate";

const read = (path: string) => readFileSync(path, "utf8");

assert.equal(JAZZ_RELAX_AUTHOR_ID, "0a847461-a429-4868-986a-59d7bf2fdb2b");
assert.equal(AURAFON_AUTHOR_ID, "59c7e5b8-eae4-4394-82fb-b815a10be6c2");
assert.notEqual(JAZZ_RELAX_AUTHOR_ID, AURAFON_AUTHOR_ID);
assert.equal(isJazzRelaxAuthor(JAZZ_RELAX_AUTHOR_ID), true);
assert.equal(isJazzRelaxAuthor(`  ${JAZZ_RELAX_AUTHOR_ID}  `), true);
assert.equal(isJazzRelaxAuthor(AURAFON_AUTHOR_ID), false);
assert.equal(isJazzRelaxAuthor(JAZZ_RELAX_AUTHOR_SLUG), false);
assert.equal(isJazzRelaxAuthor("Jazz Relax"), false);
assert.equal(isJazzRelaxAuthor("jazz-relax"), false);
assert.equal(isJazzRelaxAuthor(""), false);
assert.equal(isJazzRelaxAuthor("   "), false);
assert.equal(isJazzRelaxAuthor(null), false);
assert.equal(isJazzRelaxAuthor(undefined), false);

const jazzSource = read("src/lib/authors/jazz-relax.ts");
assert.doesNotMatch(jazzSource, /AURAFON_AUTHOR_ID|59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.doesNotMatch(read("src/lib/author-products/music-product-wizard.ts"), /jazz-relax|JAZZ_RELAX/);
assert.doesNotMatch(read("src/lib/music-analyzer-runs/worker-runtime.ts"), /append_music_passport|music_album_passports/);
assert.match(read("src/components/author-dashboard/product-wizard/AuthorProductWizardStepNav.tsx"), /Сохранить и продолжить/);
assert.match(read("src/components/author-dashboard/product-wizard/AuthorProductWizardStepNav.tsx"), /secondaryContinueLabel/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /Сохранить и создать музыкальный паспорт/);
assert.match(form, /Продолжить без музыкального паспорта/);
assert.match(form, /continueWithoutMusicPassport/);
assert.doesNotMatch(form, /jazzRelaxMustReturnToMaterials|jazzRelaxPassportCompleted/);
assert.match(
  form,
  /secondaryContinueLabel=\{\s*jazzRelaxMusicPassport && wizardStep === 2/,
);
assert.match(read("src/lib/music-passport/jazz-relax-pilot.ts"), /if \(!versionId\) \{[\s\S]*?facts: null/);
assert.doesNotMatch(read("src/lib/authors/aurafon.ts"), /Продолжить без музыкального паспорта/);

const migration = read("supabase/migrations/20261218120000_jazz_relax_album_passport.sql");
assert.match(migration, /generated_from_album_passport_version_id/);
assert.doesNotMatch(migration, /generated_from_passport_version/);
assert.match(migration, /music_album_passport_immutable/);
assert.doesNotMatch(migration, /UPDATE\s+public\.music_album_passports/);
assert.match(migration, /'pending', 'completed', 'partial', 'failed'/);
assert.match(migration, /track_passport_version_id/);
assert.match(migration, /music_analyzer_run_id/);
assert.match(migration, /aggregation_version/);
assert.match(migration, /aggregated_at/);
assert.match(read("src/app/api/author/seo/product-autofill/route.ts"), /generated_from_album_passport_version_id/);
assert.doesNotMatch(read("src/app/api/author/seo/product-autofill/route.ts"), /generated_from_passport_version/);

assert.equal(sanitizeAnalysisVersion("snapshot:932c4ce"), "snapshot-932c4ce");

const unpublished = {
  technical: {
    bpm: null,
    bpm_confidence: "low",
    lufs: -14.2,
    diagnostics: {
      bpm_candidate: 70.3125,
      bpm_candidate_raw: 140.625,
      tempo_octave_score_raw: 0.64067,
      key_candidate: "F major",
    },
  },
  genres: [{ label: "Jazz", score: 0.9 }],
  moods: [{ label: "warm", score: 0.8 }],
  instruments: [{ label: "organ", score: 0.4 }],
};
const facts = readMusicAnalyzerStructuredFacts(unpublished);
assert.equal(facts.bpm.published, null);
assert.equal(facts.bpm.candidate, 70.3125);
assert.equal(facts.bpm.raw, 140.625);
assert.equal(facts.bpm.confidence, null);
assert.notEqual(facts.bpm.raw, 0.64067);
assert.equal(facts.key.published, null);
assert.equal(facts.key.candidate, "F major");

const attributes = attributesFromStructuredFacts(facts, "analyzer-run:test");
assert.equal(attributes.some((row) => row.attribute_key === "bpm"), false);
assert.equal(attributes.some((row) => row.attribute_key === "vocal_role"), false);
assert.equal(attributes.some((row) => row.attribute_key === "genre_class"), false);
assert.equal(attributes.find((row) => row.attribute_key === "mood")?.value_text, "warm");
assert.equal(attributes.find((row) => row.attribute_key === "mood")?.confidence, 0.8);

function track(input: {
  audioItemId: string;
  passportId: string;
  runId: string;
  bpm: number | null;
  candidate?: number | null;
  key: string | null;
  genre: string;
}): AlbumTrackSnapshot {
  const structured = readMusicAnalyzerStructuredFacts({
    technical: {
      bpm: input.bpm,
      bpm_confidence: 0.9,
      diagnostics: input.candidate == null ? {} : { bpm_candidate: input.candidate },
    },
    key: input.key ? { published: input.key, published_mode: "major" } : { published: null, candidate: "Bb minor" },
    genres: [{ label: input.genre, score: 0.5 }],
  });
  return {
    audioItemId: input.audioItemId,
    passportId: input.passportId,
    runId: input.runId,
    analyzerVersion: "snapshot:932c4ce",
    analyzerGitCommit: "932c4ce",
    facts: storedFactsFromStructured(structured),
  };
}

const slow = track({
  audioItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  passportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  runId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  bpm: 72,
  candidate: 144,
  key: "C",
  genre: "jazz",
});
const fast = track({
  audioItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  passportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  runId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  bpm: 110,
  key: "F",
  genre: "lounge",
});
const draft = buildAlbumPassportDraft({ succeeded: [slow, fast], failed: [] });
assert.equal(draft.status, "completed");
assert.equal(draft.aggregationVersion, ALBUM_PASSPORT_AGGREGATION_VERSION);
assert.equal(draft.analyzerGitCommit, "932c4ce");
assert.equal(draft.bpmProfile.published?.min, 72);
assert.equal(draft.bpmProfile.published?.max, 110);
assert.equal(draft.bpmProfile.candidates.some((item) => item.value === 144), true);
assert.equal(draft.bpmProfile.published?.values.some((item) => item.value === 144), false);
assert.deepEqual(
  draft.keyProfile.published.map((item) => item.key).sort(),
  ["C", "F"],
);
assert.equal(draft.genreProfile.items.map((item) => item.label).sort().join(","), "jazz,lounge");
assert.deepEqual(
  draft.sources.map((source) => source.track_passport_version_id).sort(),
  [slow.passportId, fast.passportId],
);
assert.deepEqual(
  draft.sources.map((source) => source.music_analyzer_run_id).sort(),
  [slow.runId, fast.runId],
);

const prompt = albumPassportPromptFacts(draft);
assert.match(prompt, /72/);
assert.match(prompt, /110/);
assert.doesNotMatch(prompt, /144/);
assert.match(prompt, /Не своди разные значения/);

const pending = buildAlbumPassportDraft({
  succeeded: [slow],
  failed: [],
  pending: [{
    outcome: "pending",
    audio_item_id: fast.audioItemId,
    track_passport_version_id: null,
    music_analyzer_run_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9",
    analyzer_version: null,
    analyzer_git_commit: null,
  }],
});
assert.equal(pending.status, "pending");
assert.equal(pending.aggregationVersion, "album-passport-v1");
assert.equal(
  pending.sources.find((source) => source.audio_item_id === slow.audioItemId)?.track_passport_version_id,
  slow.passportId,
);
assert.equal(
  pending.sources.find((source) => source.outcome === "pending")?.music_analyzer_run_id,
  "cccccccc-cccc-4ccc-8ccc-ccccccccccc9",
);
assert.notEqual(pending.sourceFingerprint, draft.sourceFingerprint);

const oldAlbumId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const newAlbumId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
assert.equal(nextDescriptionAlbumBinding({
  existingVersionId: oldAlbumId,
  generatedFromVersionId: newAlbumId,
}), oldAlbumId);
assert.equal(nextDescriptionAlbumBinding({
  existingVersionId: null,
  generatedFromVersionId: newAlbumId,
}), newAlbumId);

console.log("jazz-relax-music-passport-unit: ok");
