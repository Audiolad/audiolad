import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";

import { MusicPassport } from "../src/components/music-passport/MusicPassport";
import { readMusicAnalyzerPassport } from "../src/lib/music-analyzer-runs/passport";
import { formatMeasureDetail } from "../src/lib/music-analyzer-runs/passport-display";

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
assert.match(fullMarkup, /ранг не указан/);
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

console.log("music-passport-ui-unit: ok");
