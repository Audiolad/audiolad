import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MUSIC_MASTERS_BUCKET } from "../src/lib/author-products/music-master-upload-contract";
import { PRACTICE_AUDIO_BUCKET } from "../src/lib/author-products/product-audio-upload-contract";
import { JazzRelaxPassportBody } from "../src/components/author-dashboard/product-wizard/JazzRelaxMusicPassportPanel";
import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon";
import {
  JAZZ_RELAX_AUTHOR_ID,
  JAZZ_RELAX_AUTHOR_SLUG,
  isJazzRelaxAuthor,
} from "../src/lib/authors/jazz-relax";
import { readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
import {
  albumPassportMatchesTracks,
  readAlbumPassportDisplay,
} from "../src/lib/music-passport/album-passport-display";
import {
  buildJazzRelaxPassportView,
  JAZZ_RELAX_PASSPORT_ENQUEUE_BATCH_SIZE,
  JAZZ_RELAX_PASSPORT_ENQUEUE_MAX_REQUESTS,
  jazzRelaxPassportEnqueueShouldContinue,
  jazzRelaxProgressLabel,
  jazzRelaxTrackEnqueueKind,
  selectJazzRelaxPassportEnqueue,
} from "../src/lib/music-passport/jazz-relax-status";
import {
  jazzRelaxAnalysisStorageTarget,
  jazzRelaxPassportTrackBlock,
  resolveJazzRelaxAnalysisAudio,
} from "../src/lib/music-passport/jazz-relax-pilot";
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

const sharedInstruments = ["organ", "brushes", "saxophone", "bass guitar", "electric guitar", "strings"];

function albumTrack(input: {
  audioItemId: string;
  passportId: string;
  runId: string;
  bpm: number;
  candidate: number | null;
  key: string;
  genre: string;
}): AlbumTrackSnapshot {
  return {
    audioItemId: input.audioItemId,
    passportId: input.passportId,
    runId: input.runId,
    analyzerVersion: "snapshot:932c4ce",
    analyzerGitCommit: "932c4ce",
    facts: {
      bpm: { published: input.bpm, candidate: input.candidate, raw: input.candidate },
      key: {
        published: input.key,
        published_mode: "major",
        candidate: "Bb minor",
        candidate_mode: null,
      },
      genres: [{ label: input.genre, score: 0.9 }],
      styles: [{ label: "Smooth Jazz", score: 0.4 }],
      moods: [{ label: "warm", score: 0.8 }],
      instruments: sharedInstruments.map((label) => ({ label, score: 0.2 })),
      sound_character: { label: "rich", score: 0.2 },
      loudness_lufs: -14.2,
      energy: null,
    },
  };
}

const leftTrack = albumTrack({
  audioItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
  passportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
  runId: "cccccccc-cccc-4ccc-8ccc-cccccccccc11",
  bpm: 72,
  candidate: 144,
  key: "C",
  genre: "Jazz",
});
const rightTrack = albumTrack({
  audioItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
  passportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb12",
  runId: "cccccccc-cccc-4ccc-8ccc-cccccccccc12",
  bpm: 110,
  candidate: null,
  key: "F",
  genre: "Lounge",
});
const disagreed = buildAlbumPassportDraft({ succeeded: [leftTrack, rightTrack], failed: [] });
const albumId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const albumDisplay = readAlbumPassportDisplay({ id: albumId, version: 4, draft: disagreed });
assert.ok(albumDisplay);
assert.equal(albumDisplay.id, albumId);
assert.equal(albumDisplay.status, "completed");
assert.equal(albumDisplay.analyzedTrackCount, 2);
assert.deepEqual(albumDisplay.bpm, { kind: "range", min: 72, max: 110 });
assert.equal(albumDisplay.ambiguity.some((item) => item.field === "Темп" && item.values.includes("72") && item.values.includes("110")), true);
assert.equal(albumDisplay.ambiguity.some((item) => item.field === "Тональность" && item.values.includes("C major") && item.values.includes("F major")), true);
assert.equal(albumDisplay.ambiguity.some((item) => item.field === "Жанр"), true);
assert.equal(albumDisplay.ambiguity.some((item) => item.field === "Инструменты"), false);
assert.ok(albumDisplay.instruments.includes("strings"));
assert.equal(JSON.stringify(albumDisplay).includes("144"), false);
assert.equal(JSON.stringify(albumDisplay).includes("91"), false);
assert.equal(JSON.stringify(albumDisplay).includes("rich"), false);
assert.equal(JSON.stringify(albumDisplay).includes("Bb"), false);

const agreed = buildAlbumPassportDraft({
  succeeded: [
    albumTrack({
      audioItemId: leftTrack.audioItemId,
      passportId: leftTrack.passportId,
      runId: leftTrack.runId,
      bpm: 80,
      candidate: 144,
      key: "C",
      genre: "Jazz",
    }),
    albumTrack({
      audioItemId: rightTrack.audioItemId,
      passportId: rightTrack.passportId,
      runId: rightTrack.runId,
      bpm: 80,
      candidate: 144,
      key: "C",
      genre: "Jazz",
    }),
  ],
  failed: [],
});
const agreedDisplay = readAlbumPassportDisplay({
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
  version: 5,
  draft: agreed,
});
assert.equal(agreedDisplay?.bpm?.kind, "single");
assert.equal(agreedDisplay?.ambiguity.length, 0);
assert.equal(JSON.stringify(agreedDisplay).includes("144"), false);

const unpublishedTempo = buildAlbumPassportDraft({
  succeeded: [leftTrack],
  failed: [{ audioItemId: rightTrack.audioItemId, runId: rightTrack.runId }],
});
unpublishedTempo.bpmProfile = {
  published: null,
  candidates: [{ value: 144, track_passport_version_id: leftTrack.passportId }],
  raw: [{ value: 144, track_passport_version_id: leftTrack.passportId }],
};
unpublishedTempo.styleProfile = { items: [] };
unpublishedTempo.moodProfile = { items: [] };
const missingDisplay = readAlbumPassportDisplay({
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd5",
  version: 2,
  draft: unpublishedTempo,
});
assert.equal(missingDisplay?.status, "partial");
assert.equal(missingDisplay?.analyzedTrackCount, 1);
assert.equal(missingDisplay?.bpm, null);
assert.deepEqual(missingDisplay?.styles, []);
assert.deepEqual(missingDisplay?.moods, []);
assert.equal(missingDisplay?.ambiguity.length, 0);
assert.equal(JSON.stringify(missingDisplay).includes("144"), false);
assert.equal(readAlbumPassportDisplay({
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd6",
  version: 1,
  draft: pending,
}), null);

assert.equal(albumPassportMatchesTracks(disagreed, [
  { audioItemId: leftTrack.audioItemId, state: "ready", passportVersionId: leftTrack.passportId },
  { audioItemId: rightTrack.audioItemId, state: "ready", passportVersionId: rightTrack.passportId },
]), true);
assert.equal(albumPassportMatchesTracks(disagreed, [
  { audioItemId: leftTrack.audioItemId, state: "ready", passportVersionId: leftTrack.passportId },
  { audioItemId: rightTrack.audioItemId, state: "ready", passportVersionId: rightTrack.passportId },
  { audioItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13", state: "not_ready", passportVersionId: null },
]), false);
assert.equal(albumPassportMatchesTracks(disagreed, [
  { audioItemId: leftTrack.audioItemId, state: "ready", passportVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99" },
  { audioItemId: rightTrack.audioItemId, state: "ready", passportVersionId: rightTrack.passportId },
]), false);
assert.equal(albumPassportMatchesTracks(unpublishedTempo, [
  { audioItemId: leftTrack.audioItemId, state: "ready", passportVersionId: leftTrack.passportId },
  { audioItemId: rightTrack.audioItemId, state: "failed", passportVersionId: null },
]), true);

const trackPassport = readMusicAnalyzerPassport({
  normalized: {
    technical: {
      bpm: null,
      bpm_confidence: "low",
      duration_s: 188,
      lufs: -14.2,
      diagnostics: {
        bpm_candidate: 70.3125,
        bpm_candidate_raw: 140.625,
        pulse_accepted: false,
        key_candidate: "F major",
      },
    },
    genres: [{ label: "Jazz", score: 0.9, band: "high" }],
    styles: [{ name: "Smooth Jazz", average: 0.44 }],
    moods: [{ name: "warm", average: 0.61, band: "high" }],
    sound_character: [{ label: "rich", average: 0.17, band: "low" }],
    instruments: [
      { label: "organ", average: 0.131, max: 0.42 },
      { label: "brushes", average: 0.124, max: 0.38 },
      { label: "saxophone", average: 0.123, max: 0.36 },
      { label: "bass guitar", average: 0.118, max: 0.33 },
      { label: "electric guitar", average: 0.111, max: 0.29 },
      { label: "strings", average: 0.102, max: 0.14 },
      { label: "flute", average: 0.077, max: 0.12 },
    ],
    prompt_version: "prompt-hidden-jazz",
    debug_marker: "passport-debug-json",
  },
});

function renderStatus(status: ReturnType<typeof buildJazzRelaxPassportView>): string {
  return renderToStaticMarkup(createElement(JazzRelaxPassportBody, {
    status,
    pending: false,
    onRetry: () => undefined,
    onReanalyzeTrack: () => undefined,
    onReanalyzeAll: () => undefined,
  }));
}

function splitAlbum(markup: string): { album: string; tracks: string } {
  const marker = 'data-track-passports="true"';
  const index = markup.indexOf(marker);
  assert.ok(index > 0);
  return { album: markup.slice(0, index), tracks: markup.slice(index) };
}

const completedView = buildJazzRelaxPassportView({
  tracks: [leftTrack, rightTrack].map((item, index) => ({
    audioItemId: item.audioItemId,
    title: index === 0 ? "Первый трек" : "Второй трек",
    state: "ready" as const,
    errorCode: null,
    passportVersionId: item.passportId,
    runId: item.runId,
    productPassport: {
      filename: index === 0 ? "Первый трек" : "Второй трек",
      analyzedAt: "2026-10-02T00:01:00.000Z",
      passport: trackPassport,
    },
  })),
  completedAlbumPassportVersionId: albumId,
  album: albumDisplay,
  summary: ["BPM: 72–110"],
});
assert.equal(completedView.phase, "completed");
const completedMarkup = renderStatus(completedView);
const completedParts = splitAlbum(completedMarkup);
assert.match(completedMarkup, /Паспорта треков/);
assert.match(completedParts.album, /data-album-music-passport="true"/);
assert.match(completedParts.album, /data-album-status="completed"/);
assert.match(completedParts.album, /data-analyzed-track-count="2"/);
assert.match(completedParts.album, /Музыкальный паспорт альбома/);
assert.match(completedParts.album, /72\.0–110\.0/);
assert.match(completedParts.album, /Jazz/);
assert.match(completedParts.album, /Lounge/);
assert.match(completedParts.album, /strings/);
assert.match(completedParts.album, /data-album-ambiguity="true"/);
assert.match(completedParts.album, /Расхождения между треками/);
assert.match(completedParts.album, /C major/);
assert.match(completedParts.album, /F major/);
assert.doesNotMatch(completedParts.album, /data-music-passport-mode/);
assert.doesNotMatch(completedParts.album, /id="music-passport-heading"/);
assert.doesNotMatch(completedParts.album, /№1/);
assert.doesNotMatch(completedParts.album, /Характер звучания/);
assert.doesNotMatch(completedParts.album, /О версии анализа/);
assert.doesNotMatch(completedParts.album, /Raw JSON/);
assert.doesNotMatch(completedParts.album, /экспериментальная версия/);
assert.doesNotMatch(completedParts.album, /144/);
assert.doesNotMatch(completedParts.album, /91/);
assert.doesNotMatch(completedParts.album, /rich/);
assert.doesNotMatch(completedParts.album, /Bb minor/);
assert.doesNotMatch(completedParts.album, /prompt-hidden-jazz/);
assert.doesNotMatch(completedParts.album, /passport-debug-json/);
assert.doesNotMatch(completedParts.album, /932c4ce/);
assert.match(completedParts.tracks, /data-music-passport-mode="product"/);
assert.match(completedParts.tracks, /data-track-passport="product"/);
assert.match(completedParts.tracks, /№5/);
assert.match(completedParts.tracks, /electric guitar/);
assert.match(completedParts.tracks, /Характер звучания/);
assert.match(completedParts.tracks, /rich/);
assert.match(completedParts.tracks, /70\.3/);
assert.doesNotMatch(completedParts.tracks, /№6/);
assert.doesNotMatch(completedParts.tracks, /strings/);
assert.doesNotMatch(completedParts.tracks, /flute/);
assert.doesNotMatch(completedParts.tracks, /О версии анализа/);
assert.doesNotMatch(completedParts.tracks, /Raw JSON/);
assert.doesNotMatch(completedParts.tracks, /экспериментальная версия/);
assert.doesNotMatch(completedParts.tracks, /prompt-hidden-jazz/);
assert.doesNotMatch(completedParts.tracks, /passport-debug-json/);
assert.doesNotMatch(completedParts.tracks, /932c4ce/);
assert.doesNotMatch(completedMarkup, /data-music-passport-mode="full"/);

const partialView = buildJazzRelaxPassportView({
  tracks: [
    {
      audioItemId: leftTrack.audioItemId,
      title: "Первый трек",
      state: "ready",
      errorCode: null,
      passportVersionId: leftTrack.passportId,
      runId: leftTrack.runId,
      productPassport: {
        filename: "Первый трек",
        analyzedAt: null,
        passport: trackPassport,
      },
    },
    {
      audioItemId: rightTrack.audioItemId,
      title: "Сорванный трек",
      state: "failed",
      errorCode: "analyze_failed",
      passportVersionId: null,
      runId: rightTrack.runId,
      productPassport: null,
    },
  ],
  completedAlbumPassportVersionId: null,
  album: missingDisplay,
  summary: [],
});
assert.equal(partialView.phase, "partial");
const partialMarkup = renderStatus(partialView);
const partialParts = splitAlbum(partialMarkup);
assert.match(partialParts.album, /data-album-status="partial"/);
assert.match(partialParts.album, /не указано/);
assert.doesNotMatch(partialParts.album, /144/);
assert.doesNotMatch(partialParts.album, /data-music-passport-mode/);
assert.match(partialParts.tracks, /data-music-passport-mode="product"/);
assert.match(partialParts.tracks, /Не удалось проанализировать: Сорванный трек/);
assert.match(partialParts.tracks, /Повторить анализ/);
assert.match(partialParts.tracks, /data-track-passport="failed"/);

const emptyAlbumMarkup = renderToStaticMarkup(createElement(
  JazzRelaxPassportBody,
  {
    status: buildJazzRelaxPassportView({
      tracks: [],
      completedAlbumPassportVersionId: null,
      album: null,
      summary: [],
    }),
    pending: false,
    onRetry: () => undefined,
    onReanalyzeTrack: () => undefined,
    onReanalyzeAll: () => undefined,
  },
));
assert.doesNotMatch(emptyAlbumMarkup, /data-album-music-passport/);
assert.doesNotMatch(emptyAlbumMarkup, /data-music-passport-mode/);

const panelSource = read("src/components/author-dashboard/product-wizard/JazzRelaxMusicPassportPanel.tsx");
const albumSource = read("src/components/music-passport/AlbumMusicPassport.tsx");
assert.match(panelSource, /mode="product"/);
assert.match(panelSource, /AlbumMusicPassport/);
assert.match(panelSource, /Паспорта треков/);
assert.match(panelSource, /Повторить анализ/);
assert.doesNotMatch(panelSource, /developerJson/);
assert.doesNotMatch(albumSource, /\bMusicPassport\b|<MusicPassport|mode="product"|data-music-passport-mode/);
assert.doesNotMatch(albumSource, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.match(form, /passportPhase === "completed"\s*\?\s*"Перейти к оформлению"/);
assert.match(form, /if \(jazzRelaxMusicPassport && wizardStep === 2 && passportPhase === "completed"\)/);
assert.match(form, /Продолжить без музыкального паспорта/);
assert.match(read("src/lib/music-passport/jazz-relax-pilot.ts"), /readAlbumPassportDisplay/);
assert.match(read("src/lib/music-passport/jazz-relax-pilot.ts"), /bind_description_album_passport/);
assert.match(read("src/lib/music-analyzer-runs/python-plan.ts"), /candidate_a:\s*false/);
assert.match(read("src/lib/music-analyzer-runs/constants.ts"), /932c4ce/);
assert.doesNotMatch(read("src/lib/authors/aurafon.ts"), /AlbumMusicPassport|Перейти к оформлению/);

{
  const audioItemId = "track-jazz";
  const masterId = "27e4ed87-d672-4fc6-8f38-512e58c2aaca";
  const storagePath = `practices/37dc3a6b-ad83-4d74-880c-a8222537c2a9/audio/${audioItemId}/masters/${masterId}.wav`;
  const verified = {
    id: masterId,
    audioItemId,
    assetRole: "master",
    lifecycleState: "verified",
    storageBucket: MUSIC_MASTERS_BUCKET,
    storagePath,
    originalFileName: "jazz-relax.wav",
  };
  const withMaster = resolveJazzRelaxAnalysisAudio({
    audioItemId,
    audioPath: null,
    desiredMasterAssetId: masterId,
    master: verified,
  });
  assert.equal(withMaster.kind, "music_master");
  if (withMaster.kind !== "music_master") {
    throw new Error("verified master must be the analysis source");
  }
  assert.equal(withMaster.path, storagePath);
  assert.deepEqual(jazzRelaxAnalysisStorageTarget(withMaster), {
    bucket: MUSIC_MASTERS_BUCKET,
    path: storagePath,
  });
  assert.notEqual(
    jazzRelaxPassportTrackBlock(
      { id: audioItemId, file_size_bytes: null },
      new Set(),
      new Set(),
      withMaster,
    ),
    "missing_audio",
  );

  const blankPath = resolveJazzRelaxAnalysisAudio({
    audioItemId,
    audioPath: "   ",
    desiredMasterAssetId: masterId,
    master: verified,
  });
  assert.equal(blankPath.kind, "music_master");
  assert.notEqual(
    jazzRelaxPassportTrackBlock(
      { id: audioItemId, file_size_bytes: null },
      new Set(),
      new Set(),
      blankPath,
    ),
    "missing_audio",
  );

  const neither = resolveJazzRelaxAnalysisAudio({
    audioItemId: "track-empty",
    audioPath: null,
    desiredMasterAssetId: null,
    master: null,
  });
  assert.equal(neither.kind, "missing_audio");
  assert.equal(
    jazzRelaxPassportTrackBlock(
      { id: "track-empty", file_size_bytes: null },
      new Set(),
      new Set(),
      neither,
    ),
    "missing_audio",
  );

  const rejected = resolveJazzRelaxAnalysisAudio({
    audioItemId,
    audioPath: null,
    desiredMasterAssetId: masterId,
    master: { ...verified, lifecycleState: "rejected" },
  });
  assert.equal(rejected.kind, "missing_audio");
  assert.equal(
    jazzRelaxPassportTrackBlock(
      { id: audioItemId, file_size_bytes: null },
      new Set(),
      new Set(),
      rejected,
    ),
    "missing_audio",
  );

  const legacy = resolveJazzRelaxAnalysisAudio({
    audioItemId,
    audioPath: "legacy/track.mp3",
    desiredMasterAssetId: masterId,
    master: verified,
  });
  assert.equal(legacy.kind, "practice_audio");
  if (legacy.kind === "practice_audio") {
    assert.deepEqual(jazzRelaxAnalysisStorageTarget(legacy), {
      bucket: PRACTICE_AUDIO_BUCKET,
      path: "legacy/track.mp3",
    });
  }

  const pilot = read("src/lib/music-passport/jazz-relax-pilot.ts");
  assert.match(pilot, /resolveJazzRelaxAnalysisAudio/);
  assert.match(pilot, /jazzRelaxPassportTrackBlock/);
  assert.match(pilot, /MUSIC_MASTERS_BUCKET/);
  assert.doesNotMatch(pilot, /if \(!track\.audio_path\?\.trim\(\)\) return "missing_audio"/);
  assert.doesNotMatch(pilot, /\.from\("audio_items"\)[\s\S]{0,160}\.update\(/);
  assert.doesNotMatch(pilot, /\.from\("music_audio_assets"\)[\s\S]{0,160}\.insert\(/);
}

{
  assert.equal(JAZZ_RELAX_PASSPORT_ENQUEUE_BATCH_SIZE, 1);
  assert.ok(JAZZ_RELAX_PASSPORT_ENQUEUE_MAX_REQUESTS >= 10);
  assert.equal(jazzRelaxProgressLabel(2, 10), "Музыкальный паспорт: 2 из 10 треков готовы");
  assert.equal(jazzRelaxProgressLabel(10, 10), "Музыкальный паспорт: 10 из 10 треков готовы");
  assert.equal(jazzRelaxPassportEnqueueShouldContinue({ singleTrack: false, enqueueDeferred: true }), true);
  assert.equal(jazzRelaxPassportEnqueueShouldContinue({ singleTrack: true, enqueueDeferred: true }), false);
  assert.equal(jazzRelaxPassportEnqueueShouldContinue({ singleTrack: false, enqueueDeferred: false }), false);

  const ten = Array.from({ length: 10 }, (_, index) => track({
    audioItemId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    passportId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`,
    runId: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, "0")}`,
    bpm: 70 + index,
    key: "C",
    genre: "jazz",
  }));
  const passportIdsBefore = ten.map((item) => item.passportId);
  const runIdsBefore = ten.map((item) => item.runId);
  const startCandidates = ten.map((item) => ({
    audioItemId: item.audioItemId,
    kind: jazzRelaxTrackEnqueueKind({
      action: "start" as const,
      runStatus: null,
      hasPassport: false,
    }),
  }));
  assert.equal(startCandidates.every((item) => item.kind === "enqueue"), true);

  const seen: string[] = [];
  let cursor: string | null = null;
  let waves = 0;
  for (;;) {
    const batch = selectJazzRelaxPassportEnqueue({ candidates: startCandidates, cursor });
    waves += 1;
    assert.equal(batch.selected.length, 1);
    seen.push(...batch.selected.map((item) => item.audioItemId));
    if (!batch.deferred) break;
    assert.equal(jazzRelaxPassportEnqueueShouldContinue({
      singleTrack: false,
      enqueueDeferred: batch.deferred,
    }), true);
    assert.ok(batch.cursor);
    assert.notEqual(batch.cursor, cursor);
    cursor = batch.cursor;
    assert.ok(waves < JAZZ_RELAX_PASSPORT_ENQUEUE_MAX_REQUESTS);
  }
  assert.equal(waves, 10);
  assert.deepEqual(seen, ten.map((item) => item.audioItemId));

  const seenByTwo: string[] = [];
  let cursorByTwo: string | null = null;
  let wavesByTwo = 0;
  for (;;) {
    const batch = selectJazzRelaxPassportEnqueue({
      candidates: startCandidates,
      cursor: cursorByTwo,
      batchSize: 2,
    });
    wavesByTwo += 1;
    seenByTwo.push(...batch.selected.map((item) => item.audioItemId));
    if (!batch.deferred) break;
    cursorByTwo = batch.cursor;
  }
  assert.equal(wavesByTwo, 5);
  assert.deepEqual(seenByTwo, ten.map((item) => item.audioItemId));

  const completedDraft = buildAlbumPassportDraft({ succeeded: ten, failed: [] });
  assert.equal(completedDraft.status, "completed");
  assert.equal(completedDraft.sources.length, 10);
  assert.equal(completedDraft.sources.every((source) => source.outcome === "succeeded"), true);
  assert.deepEqual(
    completedDraft.sources.map((source) => source.music_analyzer_run_id).sort(),
    [...runIdsBefore].sort(),
  );
  assert.deepEqual(
    completedDraft.sources.map((source) => source.track_passport_version_id).sort(),
    [...passportIdsBefore].sort(),
  );
  assert.ok(completedDraft.sourceFingerprint.length <= 4000);
  for (const runId of runIdsBefore) assert.match(completedDraft.sourceFingerprint, new RegExp(runId));
  assert.equal(completedDraft.bpmProfile.published?.values.length, 10);
  assert.deepEqual(ten.map((item) => item.passportId), passportIdsBefore);

  const tenAlbumId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  const tenDisplay = readAlbumPassportDisplay({ id: tenAlbumId, version: 1, draft: completedDraft });
  assert.ok(tenDisplay);
  assert.equal(tenDisplay.status, "completed");
  assert.equal(tenDisplay.analyzedTrackCount, 10);
  const tenView = buildJazzRelaxPassportView({
    tracks: ten.map((item, index) => ({
      audioItemId: item.audioItemId,
      title: `Трек ${index + 1}`,
      state: "ready" as const,
      errorCode: null,
      passportVersionId: item.passportId,
      runId: item.runId,
      productPassport: {
        filename: `Трек ${index + 1}`,
        analyzedAt: "2026-10-05T00:00:00.000Z",
        passport: trackPassport,
      },
    })),
    completedAlbumPassportVersionId: tenAlbumId,
    album: tenDisplay,
    summary: [],
  });
  assert.equal(tenView.phase, "completed");
  assert.equal(tenView.readyCount, 10);
  assert.equal(tenView.totalCount, 10);
  assert.equal(tenView.progressLabel, "Музыкальный паспорт: 10 из 10 треков готовы");
  assert.equal(tenView.enqueueDeferred, false);
  const tenMarkup = renderStatus(tenView);
  const tenParts = splitAlbum(tenMarkup);
  assert.match(tenParts.album, /data-album-music-passport="true"/);
  assert.match(tenParts.album, /data-analyzed-track-count="10"/);
  assert.equal((tenParts.tracks.match(/data-track-passport="product"/g) ?? []).length, 10);
  assert.equal((tenParts.tracks.match(/data-music-passport-mode="product"/g) ?? []).length, 10);
  assert.doesNotMatch(tenMarkup, /data-music-passport-mode="full"/);

  const failedTrack = ten[3];
  assert.ok(failedTrack);
  const kept = ten.filter((item) => item.audioItemId !== failedTrack.audioItemId);
  const keptPassportIds = kept.map((item) => item.passportId);
  const partialDraft = buildAlbumPassportDraft({
    succeeded: kept,
    failed: [{ audioItemId: failedTrack.audioItemId, runId: failedTrack.runId }],
  });
  assert.equal(partialDraft.status, "partial");
  assert.notEqual(partialDraft.status, "failed");
  assert.equal(partialDraft.sources.filter((source) => source.outcome === "succeeded").length, 9);
  assert.equal(partialDraft.sources.filter((source) => source.outcome === "failed").length, 1);
  const failedSource = partialDraft.sources.find((source) => source.audio_item_id === failedTrack.audioItemId);
  assert.equal(failedSource?.outcome, "failed");
  assert.equal(failedSource?.track_passport_version_id, null);
  assert.equal(failedSource?.music_analyzer_run_id, failedTrack.runId);
  for (const item of kept) {
    const source = partialDraft.sources.find((row) => row.audio_item_id === item.audioItemId);
    assert.equal(source?.outcome, "succeeded");
    assert.equal(source?.track_passport_version_id, item.passportId);
    assert.equal(source?.music_analyzer_run_id, item.runId);
  }
  assert.deepEqual(kept.map((item) => item.passportId), keptPassportIds);
  assert.equal(partialDraft.bpmProfile.published?.values.length, 9);
  assert.equal(
    partialDraft.bpmProfile.published?.values.some((item) => item.track_passport_version_id === failedTrack.passportId),
    false,
  );
  const partialDisplay = readAlbumPassportDisplay({
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
    version: 2,
    draft: partialDraft,
  });
  assert.ok(partialDisplay);
  assert.equal(partialDisplay.status, "partial");
  assert.equal(partialDisplay.analyzedTrackCount, 9);
  assert.equal(
    partialDisplay.ambiguity.find((item) => item.field === "Темп")?.values.includes("73"),
    false,
  );
  assert.equal(albumPassportMatchesTracks(partialDraft, ten.map((item) => ({
    audioItemId: item.audioItemId,
    state: item.audioItemId === failedTrack.audioItemId ? "failed" as const : "ready" as const,
    passportVersionId: item.audioItemId === failedTrack.audioItemId ? null : item.passportId,
  }))), true);
  const partialTenView = buildJazzRelaxPassportView({
    tracks: ten.map((item, index) => ({
      audioItemId: item.audioItemId,
      title: `Трек ${index + 1}`,
      state: item.audioItemId === failedTrack.audioItemId ? "failed" as const : "ready" as const,
      errorCode: item.audioItemId === failedTrack.audioItemId ? "analyze_failed" : null,
      passportVersionId: item.audioItemId === failedTrack.audioItemId ? null : item.passportId,
      runId: item.runId,
      productPassport: item.audioItemId === failedTrack.audioItemId ? null : {
        filename: `Трек ${index + 1}`,
        analyzedAt: null,
        passport: trackPassport,
      },
    })),
    completedAlbumPassportVersionId: null,
    album: partialDisplay,
    summary: [],
  });
  assert.equal(partialTenView.phase, "partial");
  assert.equal(partialTenView.readyCount, 9);
  assert.equal(partialTenView.totalCount, 10);
  assert.equal(partialTenView.progressLabel, "Музыкальный паспорт: 9 из 10 треков готовы");
  const partialTenMarkup = renderStatus(partialTenView);
  const partialTenParts = splitAlbum(partialTenMarkup);
  assert.match(partialTenParts.album, /data-album-status="partial"/);
  assert.match(partialTenParts.album, /data-analyzed-track-count="9"/);
  assert.equal((partialTenParts.tracks.match(/data-track-passport="product"/g) ?? []).length, 9);
  assert.match(partialTenParts.tracks, /Не удалось проанализировать: Трек 4/);
  assert.doesNotMatch(partialTenParts.album, /73/);

  const retryCandidates = ten.map((item, index) => ({
    audioItemId: item.audioItemId,
    kind: jazzRelaxTrackEnqueueKind({
      action: "retry" as const,
      runStatus: index === 3 ? "failed" : "succeeded",
      hasPassport: index !== 3,
    }),
  }));
  const retryBatch = selectJazzRelaxPassportEnqueue({ candidates: retryCandidates, cursor: null });
  assert.equal(retryBatch.selected.map((item) => item.audioItemId).join(","), failedTrack.audioItemId);
  assert.equal(retryBatch.deferred, false);
  assert.equal(retryCandidates.filter((item) => item.kind === "skip").length, 9);

  const pilotSource = read("src/lib/music-passport/jazz-relax-pilot.ts");
  const statusSource = read("src/lib/music-passport/jazz-relax-status.ts");
  const panelEnqueueSource = read("src/components/author-dashboard/product-wizard/JazzRelaxMusicPassportPanel.tsx");
  const routeSource = read("src/app/api/author/products/[id]/music-passport/route.ts");
  assert.match(pilotSource, /selectJazzRelaxPassportEnqueue/);
  assert.match(pilotSource, /enqueue_music_analyzer_run/);
  assert.match(pilotSource, /append_music_passport_from_analyzer_run/);
  assert.match(pilotSource, /insert_music_album_passport/);
  assert.doesNotMatch(pilotSource, /\.slice\(\s*0\s*,\s*2\s*\)/);
  assert.doesNotMatch(statusSource, /\.slice\(\s*0\s*,\s*2\s*\)/);
  assert.match(panelEnqueueSource, /runJazzRelaxPassportRequests/);
  assert.match(panelEnqueueSource, /enqueueAfterAudioItemId/);
  assert.match(panelEnqueueSource, /Продолжить без музыкального паспорта|Повторить анализ/);
  assert.match(routeSource, /enqueueAfterAudioItemId/);
  assert.match(read("src/lib/music-analyzer-runs/python-plan.ts"), /candidate_a:\s*false/);
  assert.match(read("src/lib/music-analyzer-runs/constants.ts"), /932c4ce8325c537668195afce0a56fa68d40a08c|932c4ce/);
  assert.equal(read("src/lib/authors/aurafon.ts").includes("59c7e5b8-eae4-4394-82fb-b815a10be6c2"), true);
}

console.log("jazz-relax-music-passport-unit: ok");
