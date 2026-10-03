import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";

import { MusicPassport } from "../src/components/music-passport/MusicPassport";
import { readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
import { formatMeasureDetail, instrumentPlaceLabel, rowQuantityDisplay } from "../src/lib/music-analyzer-runs/passport-display";

const productionGold = readMusicAnalyzerPassport({
  normalized: {
    technical: {
      bpm: null,
      bpm_confidence: "low",
      duration_s: 188.0,
      lufs: -14.2,
      sample_rate: 44100,
      channels: 2,
      format: "wav",
      diagnostics: {
        bpm_candidate: 70.3125,
        bpm_candidate_raw: 140.625,
        tempo_octave_score_raw: 0.64067,
        tempo_octave_factor: 0.5,
        key_candidate: "F major",
        key_accepted: false,
        pulse_accepted: false,
      },
    },
    genres: [{ label: "Jazz", score: 0.9, band: "high" }],
    styles: [{ name: "Smooth Jazz" }, { name: "Lounge Jazz" }],
    moods: [
      { label: "warm", score: 0.8, band: "high" },
      { label: "relaxing", score: 0.6, band: "medium" },
      { label: "calm", score: 0.4, band: "low" },
    ],
    instruments: [
      { label: "organ", score: 0.4, rank: 1 },
      { label: "brushes", score: 0.3, rank: 2 },
      { label: "electric guitar", score: 0.2 },
    ],
  },
});

assert.equal(productionGold.bpmDisplay.primary, "70.3125");
assert.equal(productionGold.bpmDisplay.raw, "140.625");
assert.notEqual(productionGold.bpmDisplay.raw, "0.64067");
assert.equal(productionGold.bpmDisplay.status, "candidate");
assert.equal(productionGold.bpmDisplay.withheld, true);
assert.equal(formatMeasureDetail(productionGold.bpmDisplay), "raw 140.625 · не прошло порог публикации");
assert.equal(productionGold.keyDisplay.primary, "F major");
assert.equal(productionGold.keyDisplay.status, "candidate");
assert.equal(productionGold.keyDisplay.withheld, true);
assert.equal(productionGold.instruments[2]?.label, "electric guitar");
assert.equal(productionGold.instruments[2]?.rank, null);

const missingPassport = readMusicAnalyzerPassport({ normalized: { technical: { duration_s: 12 } } });
assert.equal(missingPassport.bpmDisplay.primary, null);
assert.equal(missingPassport.keyDisplay.primary, null);
assert.equal(missingPassport.sound, null);
assert.deepEqual(missingPassport.genres, []);
assert.deepEqual(missingPassport.moods, []);

const header = {
  filename: "gold_001.wav",
  analyzedAt: "2026-10-02T00:01:00.000Z",
  analyzerVersion: "snapshot:932c4ce",
  statusLabel: "Готово",
  fileVersion: 1,
};
const snapshot = { version: "snapshot:932c4ce", commit: "932c4ceaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
const provenance = {
  sha256: "passport-provenance-sha",
  analyzerGitCommit: "932c4ceaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  analyzerContentCommit: "3750f3bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  modelCheckpoint: "music_audioset_epoch_15_esc_90.14.pt",
  device: "cpu",
  taxonomy: "listening-v05",
  prompt: "prompt-hidden",
};
const developerJson = { debug_marker: "passport-debug-json", tempo_octave_score_raw: 0.64067 };

const fullMarkup = renderToStaticMarkup(
  <MusicPassport
    mode="full"
    passport={productionGold}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
    developerJson={developerJson}
  />,
);
assert.match(fullMarkup, /Музыкальный паспорт · экспериментальная версия/);
assert.match(fullMarkup, /70\.3125/);
assert.match(fullMarkup, /кандидат/);
assert.match(fullMarkup, /raw 140\.625 · не прошло порог публикации/);
assert.doesNotMatch(fullMarkup, /raw 0\.64067/);
assert.match(fullMarkup, /F major/);
assert.match(fullMarkup, /Jazz/);
assert.match(fullMarkup, /Smooth Jazz/);
assert.match(fullMarkup, /Lounge Jazz/);
assert.match(fullMarkup, /warm/);
assert.match(fullMarkup, /relaxing/);
assert.match(fullMarkup, /calm/);
assert.match(fullMarkup, /высокая/);
assert.match(fullMarkup, /средняя/);
assert.match(fullMarkup, /низкая/);
assert.match(fullMarkup, /ранг 1/);
assert.match(fullMarkup, /organ/);
assert.match(fullMarkup, /brushes/);
assert.match(fullMarkup, /electric guitar/);
assert.match(fullMarkup, /№3/);
assert.doesNotMatch(fullMarkup, /ранг не указан/);
assert.match(fullMarkup, /О версии анализа/);
assert.match(fullMarkup, /passport-provenance-sha/);
assert.match(fullMarkup, /Данные разработчика \/ Raw JSON/);
assert.match(fullMarkup, /passport-debug-json/);
assert.match(fullMarkup, /188 с/);
assert.doesNotMatch(fullMarkup, /ведущий инструмент/);

const productMarkup = renderToStaticMarkup(
  <MusicPassport
    mode="product"
    passport={productionGold}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
    developerJson={developerJson}
  />,
);
assert.match(productMarkup, /Музыкальный паспорт/);
assert.doesNotMatch(productMarkup, /экспериментальная версия/);
assert.match(productMarkup, /70\.3125/);
assert.match(productMarkup, /raw 140\.625 · не прошло порог публикации/);
assert.match(productMarkup, /Jazz/);
assert.match(productMarkup, /organ/);
assert.doesNotMatch(productMarkup, /О версии анализа/);
assert.doesNotMatch(productMarkup, /passport-provenance-sha/);
assert.doesNotMatch(productMarkup, /prompt-hidden/);
assert.doesNotMatch(productMarkup, /Raw JSON/);
assert.doesNotMatch(productMarkup, /passport-debug-json/);
assert.doesNotMatch(productMarkup, /0\.64067/);
assert.doesNotMatch(productMarkup, /ведущий инструмент/);

const missingMarkup = renderToStaticMarkup(
  <MusicPassport
    mode="product"
    passport={missingPassport}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
    developerJson={developerJson}
  />,
);
assert.match(missingMarkup, /Темп/);
assert.match(missingMarkup, /Тональность/);
assert.match(missingMarkup, /не указано/);
assert.doesNotMatch(missingMarkup, /70\.3125/);
assert.doesNotMatch(missingMarkup, /кандидат/);
assert.doesNotMatch(missingMarkup, /Jazz/);
assert.doesNotMatch(missingMarkup, /Raw JSON/);
assert.doesNotMatch(missingMarkup, /passport-debug-json/);
assert.doesNotMatch(missingMarkup, /О версии анализа/);

const gold001Normalized = {
  genres: [{ name: "Jazz", average: 0.82, max: 0.91, band: "high" }],
  styles: [{ name: "Smooth Jazz", average: 0.44, max: 0.5, band: "medium" }],
  moods: [{ name: "warm", average: 0.61, max: 0.7, band: "high" }],
  instruments: [
    { label: "organ", average: 0.131, max: 0.42, band: "medium" },
    { label: "brushes", average: 0.124, max: 0.38, band: "medium" },
    { label: "saxophone", average: 0.123, max: 0.36, band: "low" },
    { label: "bass guitar", average: 0.118, max: 0.33, band: "low" },
    { label: "electric guitar", average: 0.111, max: 0.29, band: "low" },
  ],
};
const gold001 = readMusicAnalyzerPassport({ normalized: gold001Normalized });
assert.deepEqual(
  gold001.instruments.map((row) => row.label),
  ["organ", "brushes", "saxophone", "bass guitar", "electric guitar"],
);
assert.deepEqual(gold001.instruments.map((row) => row.rank), [null, null, null, null, null]);
assert.deepEqual(
  gold001.instruments.map((row) => row.average),
  ["0.131", "0.124", "0.123", "0.118", "0.111"],
);
assert.equal(gold001.instruments[0]?.score, null);
assert.equal(gold001.instruments[0]?.max, "0.42");
assert.equal(gold001.genres[0]?.score, null);
assert.equal(gold001.genres[0]?.average, "0.82");
assert.equal(gold001.styles[0]?.average, "0.44");
assert.equal(gold001.moods[0]?.average, "0.61");
assert.equal(rowQuantityDisplay(gold001.instruments[0]!).primary, "0.131");
assert.equal(instrumentPlaceLabel(gold001.instruments[0]!, 0), "№1");
assert.equal(instrumentPlaceLabel({ ...gold001.instruments[0]!, rank: 1 }, 0), "ранг 1");

const goldFacts = readMusicAnalyzerStructuredFacts(gold001Normalized);
assert.equal(goldFacts.instruments[0]?.label, "organ");
assert.equal(goldFacts.instruments[0]?.score, null);
assert.equal(goldFacts.genres[0]?.score, null);

const goldMarkup = renderToStaticMarkup(
  <MusicPassport
    mode="full"
    passport={gold001}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
  />,
);
assert.match(goldMarkup, /№1[\s\S]*organ[\s\S]*0\.131[\s\S]*max 0\.42/);
assert.match(goldMarkup, /№2[\s\S]*brushes[\s\S]*0\.124/);
assert.match(goldMarkup, /№3[\s\S]*saxophone[\s\S]*0\.123/);
assert.match(goldMarkup, /№4[\s\S]*bass guitar[\s\S]*0\.118/);
assert.match(goldMarkup, /№5[\s\S]*electric guitar[\s\S]*0\.111/);
assert.match(goldMarkup, /Jazz[\s\S]*0\.82[\s\S]*max 0\.91/);
assert.match(goldMarkup, /Smooth Jazz[\s\S]*0\.44/);
assert.match(goldMarkup, /warm[\s\S]*0\.61/);
assert.doesNotMatch(goldMarkup, /ранг не указан/);
assert.doesNotMatch(goldMarkup, /оценка не указана/);
assert.doesNotMatch(goldMarkup, /ведущий инструмент/);

const maxOnly = readMusicAnalyzerPassport({
  normalized: {
    instruments: [{ label: "piano", max: 0.2, band: "low" }],
  },
});
assert.equal(maxOnly.instruments[0]?.average, null);
assert.equal(maxOnly.instruments[0]?.score, null);
assert.equal(rowQuantityDisplay(maxOnly.instruments[0]!).primary, null);
assert.equal(rowQuantityDisplay(maxOnly.instruments[0]!).max, "0.2");
const maxOnlyMarkup = renderToStaticMarkup(
  <MusicPassport
    mode="product"
    passport={maxOnly}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
    developerJson={{ debug: true }}
  />,
);
assert.match(maxOnlyMarkup, /№1/);
assert.match(maxOnlyMarkup, /piano/);
assert.match(maxOnlyMarkup, /0\.2/);
assert.doesNotMatch(maxOnlyMarkup, /оценка не указана/);
assert.doesNotMatch(maxOnlyMarkup, /Raw JSON/);

const blankScore = readMusicAnalyzerPassport({
  normalized: { instruments: [{ label: "harp" }] },
});
const blankMarkup = renderToStaticMarkup(
  <MusicPassport
    mode="full"
    passport={blankScore}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
  />,
);
assert.match(blankMarkup, /№1/);
assert.match(blankMarkup, /оценка не указана/);

console.log("music-passport-ui-unit: ok");
