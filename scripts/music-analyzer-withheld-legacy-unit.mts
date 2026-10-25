import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MusicPassport } from "../src/components/music-passport/MusicPassport";
import { AlbumMusicPassport } from "../src/components/music-passport/AlbumMusicPassport";
import { JazzRelaxPassportBody } from "../src/components/author-dashboard/product-wizard/JazzRelaxMusicPassportPanel";
import type { JazzRelaxPassportView } from "../src/lib/music-passport/jazz-relax-status";
import { readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
import { buildFeatures } from "../src/lib/music-analyzer-runs/features.mjs";
import {
  albumPassportPromptFacts, albumPassportSummaryLines, attributesFromStructuredFacts,
  buildAlbumPassportDraft, parseStoredStructuredFacts, storedFactsFromStructured,
} from "../src/lib/music-passport/album-aggregate";
import { readAlbumPassportDisplay } from "../src/lib/music-passport/album-passport-display";

const tags = [
  { id: "new_age", label: "New Age", average: 0.5, band: "high", research_only: false },
  { id: "dark_jazz", label: "Dark Jazz", average: 0.4, band: "high", research_only: false },
  { id: "relaxation_music", label: "Relaxation Music", average: 0.3, research_only: true },
  { label: "Hidden Candidate", average: 0.25, status: "withheld" },
  { label: "Lounge Jazz", average: 0.2 },
  { label: "Ambient", average: 0.1 },
  { label: "Drone", average: 0.05 },
];
const legacy = { genres: tags, styles: tags, moods: tags, instruments: tags, sound_character: tags };
const forbidden = /dark[ _-]*jazz|Relaxation Music|Hidden Candidate/i;
const safe = (value: unknown) => assert.doesNotMatch(typeof value === "string" ? value : JSON.stringify(value), forbidden);
const legacySnapshot = JSON.stringify(legacy);
const passport = readMusicAnalyzerPassport({ normalized: legacy });
const facts = readMusicAnalyzerStructuredFacts(legacy);
const stored = storedFactsFromStructured(facts);
const expected = ["New Age", "Lounge Jazz", "Ambient"];
assert.deepEqual(passport.styles.map(row => row.label), expected);
assert.deepEqual(passport.genres.map(row => row.label), expected);
assert.deepEqual(facts.styles.map(row => row.label), expected);
assert.deepEqual(facts.genres.map(row => row.label), expected);
assert.equal(passport.styles.some(row => row.label === "Drone"), false);
assert.deepEqual(readMusicAnalyzerPassport({ normalized: { styles: tags.slice(1, 4) } }).styles, []);
for (const value of [passport, facts, stored, parseStoredStructuredFacts(stored), attributesFromStructuredFacts(facts, "legacy")]) safe(value);

// Old DB rows may retain flags, or only a label and score. Check each reader directly.
const dirtyTags = tags.map(tag => ({ ...tag, score: tag.average }));
const dirtyStored = { ...stored, genres: dirtyTags, styles: dirtyTags, moods: dirtyTags,
  instruments: dirtyTags, sound_character: dirtyTags[1] };
const dirtyFacts = { ...facts, genres: dirtyTags, styles: dirtyTags, moods: dirtyTags,
  instruments: dirtyTags, soundCharacter: dirtyTags[1] };
safe(parseStoredStructuredFacts(dirtyStored));
safe(storedFactsFromStructured(dirtyFacts));
const dirtyAttributeTags = [
  { label: "dark_jazz", score: 0.9 }, { label: "research", score: 0.8, research_only: true },
  { label: "hidden_candidate", score: 0.7, status: "withheld" }, { label: "ambient", score: 0.6 },
];
assert.deepEqual(attributesFromStructuredFacts({ ...dirtyFacts, genres: dirtyAttributeTags }, "dirty")
  .filter(item => item.attribute_key === "genre_class").map(item => item.value_text), ["ambient"]);
assert.deepEqual(attributesFromStructuredFacts({ ...facts, genres: [
  { label: "dark_jazz", score: 0.9 }, { label: "ambient", score: 0.6 },
] }, "labels").filter(item => item.attribute_key === "genre_class").map(item => item.value_text), ["ambient"]);
// Do not invent a label-only ban for research tags after their flags were lost.
assert.deepEqual(parseStoredStructuredFacts({ ...stored, styles: [
  { label: "Dark Jazz", score: null }, { label: "Relaxation Music", score: null },
] })?.styles, [{ label: "Relaxation Music", score: null }]);

const album = buildAlbumPassportDraft({ succeeded: [{ audioItemId: "track", passportId: "passport", runId: "run",
  analyzerVersion: "legacy", analyzerGitCommit: null, facts: dirtyStored }], failed: [] });
safe(album);
assert.ok(album.styleProfile.items.some(item => item.label === "Lounge Jazz"));
const profile = { items: dirtyTags.map(tag => ({ ...tag, track_passport_version_ids: ["passport"], scores: [tag.score] })) };
const dirtyAlbum = { ...album, genreProfile: profile, styleProfile: profile, moodProfile: profile,
  instrumentProfile: profile, characterProfile: profile };
safe(albumPassportSummaryLines(dirtyAlbum));
safe(albumPassportPromptFacts(dirtyAlbum));
const display = readAlbumPassportDisplay({ id: "album", version: 1, draft: dirtyAlbum });
assert.ok(display);
safe(display);
assert.match(JSON.stringify(display), /Lounge Jazz/);
safe(renderToStaticMarkup(createElement(AlbumMusicPassport, { album: display })));
// Defense at render time when an already-materialized snapshot bypasses the reader.
const dirtyDisplay = { ...display, genres: ["Dark Jazz", "New Age"], styles: ["dark_jazz", "Lounge Jazz"],
  ambiguity: [{ field: "Стиль" as const, values: ["Dark Jazz", "Lounge Jazz"] }] };
safe(renderToStaticMarkup(createElement(AlbumMusicPassport, { album: dirtyDisplay })));

const provenance = { sha256: null, analyzerGitCommit: null, analyzerContentCommit: null,
  modelCheckpoint: null, device: null, taxonomy: null, prompt: null };
const header = { filename: "legacy.wav", analyzedAt: null, analyzerVersion: "legacy", statusLabel: "Готово", fileVersion: null };
const dirtyRows = dirtyTags.map(tag => ({ ...passport.styles[0], ...tag, average: String(tag.average), score: String(tag.score) }));
const dirtyPassport = { ...passport, genres: dirtyRows, styles: dirtyRows, moods: dirtyRows,
  instruments: dirtyRows, sound: dirtyRows[1] };
const dirtyFeatures = buildFeatures({});
for (const key of ["genre", "subgenre", "mood", "instruments"]) {
  dirtyFeatures.features[key] = { ...dirtyFeatures.features[key], value: dirtyTags };
}
for (const mode of ["full", "product"] as const) {
  for (const view of [passport, dirtyPassport, { ...dirtyPassport, features: dirtyFeatures }]) {
    const html = renderToStaticMarkup(createElement(MusicPassport, {
      mode, passport: view, header, snapshot: { version: "legacy", commit: null }, provenance,
    }));
    safe(html);
    assert.match(html, /New Age/);
    assert.match(html, /Lounge Jazz/);
  }
}
// Other legacy shapes use the same rule, including aliases and grouped tags.
for (const normalized of [
  { styles: ["Dark Jazz", "New Age", "Lounge Jazz", "Ambient"] },
  { styles: { dark_jazz: 0.9, ambient: 0.8 } },
  { tags: tags.map(tag => ({ ...tag, group: "style" })) },
  { styles: [{ name: "Dark Jazz" }, { name: "New Age" }] },
]) safe(readMusicAnalyzerPassport({ normalized }));

const status = { phase: "completed", album: dirtyDisplay, tracks: [], readyCount: 1, summary: [],
  totalCount: 1, failedCount: 0, progressLabel: "Готово", enqueueDeferred: false } as unknown as JazzRelaxPassportView;
const bodyProps = { status, pending: false, onRetry() {}, onReanalyzeTrack() {}, onReanalyzeAll() {} };
safe(renderToStaticMarkup(createElement(JazzRelaxPassportBody, bodyProps)));
const fallbackHtml = renderToStaticMarkup(createElement(JazzRelaxPassportBody, {
  ...bodyProps, status: { ...status, album: null, summary: ["Жанры: Dark Jazz, New Age", "Стили: dark_jazz, Lounge Jazz"] },
}));
safe(fallbackHtml);
assert.match(fallbackHtml, /New Age/);
assert.match(fallbackHtml, /Lounge Jazz/);
assert.equal(JSON.stringify(legacy), legacySnapshot);
console.log("Legacy withholding: passport, stored facts, album, full/product HTML and author panel passed.");
