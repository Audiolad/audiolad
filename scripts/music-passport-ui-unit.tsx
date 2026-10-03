import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";

import { MusicPassport } from "../src/components/music-passport/MusicPassport";
import { readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "../src/lib/music-analyzer-runs/passport";
import {
  formatAnalyzedAtMoscow,
  formatDisplayedBpm,
  formatDisplayedDuration,
  formatDisplayedLufs,
  formatDisplayedQuantity,
  formatMeasureDetail,
  instrumentPlaceLabel,
  rowQuantityDisplay,
} from "../src/lib/music-analyzer-runs/passport-display";

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
assert.equal(formatDisplayedBpm(productionGold.bpmDisplay.primary), "70.3");
assert.equal(formatDisplayedBpm(productionGold.bpmDisplay.raw), "140.6");
assert.equal(formatDisplayedBpm("100"), "100.0");
assert.equal(formatDisplayedLufs("-14.2"), "-14.2");
assert.equal(formatDisplayedLufs("-14.26"), "-14.3");
assert.equal(formatDisplayedLufs("-15"), "-15.0");
assert.equal(formatDisplayedDuration("188 с"), "3:08");
assert.equal(formatDisplayedDuration("200.5 с"), "3:21");
assert.equal(formatDisplayedDuration("12"), "0:12");
assert.equal(formatDisplayedDuration("1500 мс"), "0:02");
assert.equal(formatDisplayedQuantity("0.131103"), "0.131");
assert.equal(formatDisplayedQuantity("0.175234"), "0.175");
assert.equal(formatDisplayedQuantity("0.0506"), "0.051");
assert.equal(formatDisplayedQuantity("0.131"), "0.131");
assert.equal(formatDisplayedQuantity("0.42"), "0.42");
assert.equal(formatAnalyzedAtMoscow("2026-10-02T00:01:00.000Z"), "2 октября 2026, 03:01 МСК");
assert.equal(formatAnalyzedAtMoscow("2026-10-03T15:38:00.000Z"), "3 октября 2026, 18:38 МСК");
assert.equal(formatAnalyzedAtMoscow(null), "не указано");
assert.equal(formatAnalyzedAtMoscow("not-a-date"), "не указано");
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
assert.deepEqual(
  Object.keys(header).sort(),
  ["analyzedAt", "analyzerVersion", "fileVersion", "filename", "statusLabel"],
);
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
assert.match(fullMarkup, /70\.3/);
assert.doesNotMatch(fullMarkup, /70\.3125/);
assert.match(fullMarkup, /кандидат/);
assert.match(fullMarkup, /raw 140\.6 · не прошло порог публикации/);
assert.doesNotMatch(fullMarkup, /140\.625/);
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
assert.match(fullMarkup, /3:08/);
assert.match(fullMarkup, /-14\.2/);
assert.doesNotMatch(fullMarkup, /188 с/);
assert.match(fullMarkup, /2 октября 2026, 03:01 МСК/);
assert.doesNotMatch(fullMarkup, /2026-10-02T00:01:00/);
const fullHeader = /data-passport-header="true"[\s\S]*?<\/header>/.exec(fullMarkup)?.[0] ?? "";
assert.match(fullHeader, /gold_001\.wav/);
assert.doesNotMatch(fullHeader, /932c4ce/);
assert.doesNotMatch(fullHeader, /снимок/);
assert.doesNotMatch(fullHeader, /Human Listening Validation/);
assert.match(fullMarkup, /О версии анализа[\s\S]*932c4ceaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
assert.match(fullMarkup, /data-passport-signal="label">Jazz<\/span>[\s\S]*data-passport-signal="band">высокая<\/span>[\s\S]*data-passport-quantity="secondary">0\.9/);
assert.match(fullMarkup, /data-sound-character="fit"/);
assert.match(fullMarkup, /w-fit/);
assert.doesNotMatch(fullMarkup, /lg:grid-cols-2/);
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
assert.match(productMarkup, /70\.3/);
assert.doesNotMatch(productMarkup, /70\.3125/);
assert.match(productMarkup, /raw 140\.6 · не прошло порог публикации/);
assert.doesNotMatch(productMarkup, /932c4ce/);
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

const tenInstruments = [
  { label: "organ", average: 0.131103, max: 0.175234, band: "medium" },
  { label: "brushes", average: 0.123645, max: 0.177415, band: "medium" },
  { label: "saxophone", average: 0.122596, max: 0.163785, band: "low" },
  { label: "bass guitar", average: 0.118182, max: 0.1249, band: "low" },
  { label: "electric guitar", average: 0.110964, max: 0.123683, band: "low" },
  { label: "strings", average: 0.102372, max: 0.142099, band: "low" },
  { label: "acoustic guitar", average: 0.078663, max: 0.106735, band: "low" },
  { label: "flute", average: 0.077252, max: 0.120632, band: "low" },
  { label: "hand percussion", average: 0.051503, max: 0.0902, band: "low" },
  { label: "double bass", average: 0.0506, max: 0.057179, band: "low" },
];
const precisePassport = readMusicAnalyzerPassport({
  normalized: {
    technical: {
      bpm: null,
      bpm_confidence: "low",
      duration_s: 200.5,
      lufs: -14.26,
      diagnostics: {
        bpm_candidate: 70.3125,
        bpm_candidate_raw: 140.625,
        pulse_accepted: false,
      },
    },
    genres: [{ name: "Blues", average: 0.334211, max: 0.354713, band: "high" }],
    styles: [{ name: "Lounge Jazz", average: 0.427353, max: 0.471471, band: "high" }],
    moods: [{ name: "warm", average: 0.30539, max: 0.362738, band: "high" }],
    sound_character: [{ label: "rich", average: 0.170706, max: 0.196714, band: "low" }],
    instruments: tenInstruments,
  },
});
assert.equal(precisePassport.bpmDisplay.primary, "70.3125");
assert.equal(precisePassport.bpmDisplay.raw, "140.625");
assert.equal(precisePassport.instruments[0]?.average, "0.131103");
assert.equal(precisePassport.instruments[0]?.score, null);
assert.equal(precisePassport.instruments.length, 10);
assert.equal(precisePassport.technical.find((row) => row.label === "Длительность")?.value, "200.5 с");
assert.equal(precisePassport.technical.find((row) => row.label === "LUFS")?.value, "-14.26");

const preciseFull = renderToStaticMarkup(
  <MusicPassport
    mode="full"
    passport={precisePassport}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
    developerJson={developerJson}
  />,
);
assert.match(preciseFull, /70\.3/);
assert.match(preciseFull, /raw 140\.6/);
assert.match(preciseFull, /3:21/);
assert.match(preciseFull, /-14\.3/);
assert.doesNotMatch(preciseFull, /70\.3125/);
assert.doesNotMatch(preciseFull, /140\.625/);
assert.doesNotMatch(preciseFull, /200\.5 с/);
assert.doesNotMatch(preciseFull, /-14\.26/);
assert.doesNotMatch(preciseFull, /0\.131103/);
assert.doesNotMatch(preciseFull, /0\.334211/);
assert.match(preciseFull, /№1[\s\S]*organ[\s\S]*0\.131[\s\S]*max 0\.175/);
assert.match(preciseFull, /№10[\s\S]*double bass/);
assert.match(preciseFull, /data-passport-signal="label">Blues<\/span>[\s\S]*data-passport-signal="band">высокая<\/span>[\s\S]*data-passport-quantity="secondary">0\.334/);
assert.match(preciseFull, /data-passport-quantity="secondary">max 0\.355/);
assert.match(preciseFull, /Lounge Jazz[\s\S]*высокая/);
assert.match(preciseFull, /data-passport-signal="label">rich<\/span>[\s\S]*data-passport-signal="band">низкая/);
assert.match(preciseFull, /data-sound-character="fit"/);
assert.match(preciseFull, /О версии анализа/);
assert.match(preciseFull, /passport-debug-json/);
assert.equal(precisePassport.bpmDisplay.primary, "70.3125");
assert.equal(precisePassport.instruments[0]?.average, "0.131103");

const preciseProduct = renderToStaticMarkup(
  <MusicPassport
    mode="product"
    passport={precisePassport}
    header={header}
    snapshot={snapshot}
    provenance={provenance}
    developerJson={developerJson}
  />,
);
assert.match(preciseProduct, /№5[\s\S]*electric guitar/);
assert.doesNotMatch(preciseProduct, /№6/);
assert.doesNotMatch(preciseProduct, /strings/);
assert.doesNotMatch(preciseProduct, /double bass/);
assert.doesNotMatch(preciseProduct, /О версии анализа/);
assert.doesNotMatch(preciseProduct, /passport-provenance-sha/);
assert.doesNotMatch(preciseProduct, /Raw JSON/);
assert.doesNotMatch(preciseProduct, /passport-debug-json/);
assert.doesNotMatch(preciseProduct, /экспериментальная версия/);
assert.doesNotMatch(preciseProduct, /932c4ce/);
assert.match(preciseProduct, /data-passport-signal="label">Blues<\/span>[\s\S]*data-passport-signal="band">высокая/);
assert.match(preciseProduct, /data-passport-quantity="secondary">0\.334/);
assert.equal(precisePassport.instruments.length, 10);

console.log("music-passport-ui-unit: ok");
