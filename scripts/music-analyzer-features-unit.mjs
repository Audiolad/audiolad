import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { MUSIC_ANALYZER_ENERGY_PUBLIC, publicMusicAnalyzerFeatures, buildFeatures, readFeatures, applyOverrides, validateOverride } from "../src/lib/music-analyzer-runs/features.mjs";
import { EnvelopeMeter, parseEbur128, measureLocalAudio } from "../src/lib/music-analyzer-runs/local-dsp.mjs";
import { featureDisplayRows } from "../src/lib/music-analyzer-runs/feature-display.mjs";
import { reanalysisSelection, reanalysisId } from "../src/lib/music-analyzer-runs/selective-reanalysis.mjs";
import { compareReference, evaluate } from "./evaluate-music-features.mjs";

test("Пустые данные не становятся тишиной, инструменталом или Ambient", () => {
  const f = buildFeatures({}).features;
  for (const key of ["energy_0_100", "vocal_role", "genre", "loudness_lufs", "perceived_speed", "tempo"]) assert.equal(f[key].value, null);
  assert.equal(readFeatures({}), null);
});

test("Старая энергия не меняется, новая шкала 0–100 имеет источник и версию", () => {
  const n = { technical: { energy: 0.4, bpm: 90 }, genres: [{ label: "Jazz", score: 0.93 }] };
  const original = structuredClone(n);
  const f = buildFeatures(n, {}, "commit:checkpoint:sha");
  assert.deepEqual(n, original);
  assert.equal(f.features.energy_0_100.value, 40);
  assert.equal(f.features.energy_0_100.model_version, "commit:checkpoint:sha");
  assert.equal(f.features.genre.value[0].score, 0.93);
  assert.equal(f.features.genre.value[0].confidence, null);
  assert.equal(f.features.genre.origin, "interpreted");
  assert.equal(buildFeatures({ technical: { energy: 40 } }).features.energy_0_100.value, null);
  const old = buildFeatures({}, { energy_0_100: 68, algorithm_version: "audiolad-dsp:1" });
  const restored = readFeatures({ analysis_features_v1: old });
  assert.equal(restored.features.energy_0_100.value, 68);
  assert.equal(restored.features.energy_0_100.model_version, "audiolad-dsp:1");
  assert.equal(restored.features.energy_0_100.source, "local:rms-onsets");
});

test("Dark Jazz удерживается в жанрах и поджанрах без подмены на Ambient", () => {
  const f = buildFeatures({ genres: [{ label: "Dark Jazz", score: 0.99 }, { label: "Ambient", score: 0.6 }], styles: ["dark_jazz"] });
  assert.equal(f.features.genre.value[0].status, "withheld");
  assert.equal(f.features.genre.value[1].status, "candidate");
  assert.equal(f.features.subgenre.value[0].status, "withheld");
});

test("Половинный/двойной темп не превращается в выбранный BPM", () => {
  const n = { technical: { bpm: null, diagnostics: { bpm_candidate: 70, bpm_candidate_raw: 140, tempo_octave_factor: 0.5, pulse_accepted: false } } };
  const f = buildFeatures(n, { rhythm_salience: 0.9, onset_density: 3 }).features;
  assert.equal(f.tempo.value.bpm, null);
  assert.deepEqual(f.tempo.value.alternatives_bpm, [35, 70, 140]);
  assert.equal(f.tempo.value.rhythm, "uncertain");
  assert.equal(f.perceived_speed.value, null);
  const fast = buildFeatures({ technical: { bpm: 70 } }, { rhythm_salience: 0.8, onset_density: 3 }).features;
  const slow = buildFeatures({ technical: { bpm: 140 } }, { rhythm_salience: 0.8, onset_density: 0.4 }).features;
  assert.equal(fast.perceived_speed.value, "fast");
  assert.equal(slow.perceived_speed.value, "slow");
  assert.equal(buildFeatures({}, { rhythm_salience: 0.8, onset_density: 3 }).features.perceived_speed.value, "fast");
  assert.equal(buildFeatures({ technical: { bpm: 120 } }).features.tempo.value.rhythm, "uncertain");
});

test("Вокал и речь остаются разными прогнозами", () => {
  assert.equal(buildFeatures({ vocal_role: "spoken", vocal_confidence: 0.8 }).features.vocal_role.value, "spoken");
  assert.equal(buildFeatures({ vocal_role: "vocal" }).features.vocal_role.value, "vocal");
  assert.equal(buildFeatures({ vocal_role: "instrumental" }).features.vocal_role.confidence, null);
  assert.equal(buildFeatures({ vocal_role: "garbage" }).features.vocal_role.value, null);
});

test("Реальная схема freeze 932c4ce: скрытые DSP, vocal.type и research_only", () => {
  const f = buildFeatures({ analysis: { embedding_model: "laion_clap:checkpoint" },
    technical: { duration_seconds: 188, true_peak_dbtp: -1.1, rms_db: -20, dynamics_db: 4, spectral_centroid_hz: 300 },
    vocal: { type: "instrumental", scores: { spoken_word: { average: 0.5 }, instrumental: { average: 0.3 }, vocal: { average: 0.2 }, mixed: { average: 0.25 } } },
    styles: [{ label: "Spa Music", average: 0.4, research_only: true }] }).features;
  assert.equal(f.duration_s.value, 188);
  assert.equal(f.true_peak_dbtp.value, -1.1);
  assert.equal(f.dynamics_db.value, 4);
  assert.equal(f.energy_0_100.value, null); // RMS alone cannot estimate energy.
  assert.equal(f.vocal_role.value, "spoken");
  assert.equal(f.vocal_role.confidence, null);
  assert.equal(f.subgenre.value[0].status, "withheld");
  assert.equal(buildFeatures({ vocal: { type: "instrumental", scores: { spoken_word: { average: 0.3 }, instrumental: { average: 0.3 } } } }).features.vocal_role.value, null);
});

test("Измерения отличают тишину, постоянный тон и периодические атаки", () => {
  const silence = new EnvelopeMeter(), tone = new EnvelopeMeter(), pulses = new EnvelopeMeter();
  for (let i = 0; i < 8000 * 12; i++) {
    silence.push(0);
    tone.push(0.2 * Math.sin(2 * Math.PI * 200 * i / 8000));
    pulses.push(i % 4000 < 400 ? 0.5 * Math.sin(2 * Math.PI * 200 * i / 8000) : 0);
  }
  const s = silence.finish(), t = tone.finish(), p = pulses.finish();
  assert.equal(s.rms_dbfs, null); assert.equal(s.energy_0_100, 0); assert.equal(s.rhythm_salience, 0);
  assert.ok(Math.abs(t.rms_dbfs - -16.9897) < 0.001);
  assert.equal(t.rhythm_salience, 0); assert.ok(t.dynamic_spread_db < 0.001);
  assert.ok(Math.abs(t.local_spectral_centroid_hz - 200) < 20);
  assert.ok(t.spectral_flux < 0.001);
  assert.deepEqual(tone.finish(), t); // Deterministic, repeatable finish.
  assert.ok(p.energy_0_100 - t.energy_0_100 >= 20);
  assert.ok(p.rhythm_salience > 0.9); assert.ok(p.onset_density > 1.5);
  assert.throws(() => silence.push(NaN), /invalid_pcm/);
});

test("LUFS и true peak читаются из итогового блока, пропуски не равны нулю", () => {
  const result = parseEbur128("ffmpeg version 6.1.1\nI: -2 LUFS\nSummary:\n Integrated loudness:\n I: -18.3 LUFS\n True peak:\n Peak: -1.2 dBFS");
  assert.equal(result.loudness_lufs, -18.3); assert.equal(result.true_peak_dbtp, -1.2);
  assert.equal(result.ffmpeg_version, "6.1.1");
  assert.equal(parseEbur128("Summary: I: -inf LUFS").loudness_lufs, null);
});

test("Отмена локального анализа не запускает ffmpeg", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(measureLocalAudio("unused.wav", controller.signal), /aborted/);
});

test("История поправок сохраняет автоматику, reset и несколько независимых правок", () => {
  const automatic = buildFeatures({ technical: { energy: 0.2 } });
  const original = structuredClone(automatic);
  const effective = applyOverrides(automatic, [{ id: 1, patch: { energy_0_100: 70 } }, { id: 2, patch: { vocal_role: "spoken" } }, { id: 3, patch: { energy_0_100: null } }]);
  assert.deepEqual(automatic, original);
  assert.equal(effective.features.energy_0_100.value, 20);
  assert.equal(effective.features.vocal_role.value, "spoken");
  assert.equal(effective.features.vocal_role.source, "manual:2");
  assert.equal(effective.features.vocal_role.confidence, null);
  for (const patch of [{}, { energy_0_100: -1 }, { rhythm_salience: 2 }, { mood: "calm" }, { vocal_role: "silence" }, { tempo: 120 }, { energy_0_100: NaN }, { constructor: "bad" }]) assert.throws(() => validateOverride(patch), /invalid_override/);
});

test("Выборка ограничена, дедуплицирована и повтор запроса идемпотентен", () => {
  const a = "11111111-1111-4111-a111-111111111111", b = "22222222-2222-4222-a222-222222222222";
  assert.deepEqual(reanalysisSelection([a, a]), [a]);
  assert.throws(() => reanalysisSelection([])); assert.throws(() => reanalysisSelection(Array(11).fill(a)));
  assert.throws(() => reanalysisSelection(["all"]));
  assert.equal(reanalysisId(a, b), reanalysisId(a.toUpperCase(), b));
  assert.notEqual(reanalysisId(a, b), reanalysisId(b, a));
});

test("UI различает оценку, измерение и неизвестное", () => {
  const rows = featureDisplayRows(buildFeatures({}, { energy_0_100: 42, rhythm_salience: 0.2, loudness_lufs: -18.3 }));
  assert.equal(MUSIC_ANALYZER_ENERGY_PUBLIC, true);
  assert.match(rows.find(r => r.key === "energy_0_100").label, /предварительная оценка/);
  assert.match(rows.find(r => r.key === "energy_0_100").reason, /калибруется/);
  const internal = buildFeatures({}, { energy_0_100: 42 });
  assert.equal(publicMusicAnalyzerFeatures(internal).features.energy_0_100.value, 42);
  assert.equal(readFeatures({ analysis_features_v1: internal }).features.energy_0_100.value, 42);
  assert.equal(rows.find(r => r.key === "vocal_role").value, "не определено");
  assert.equal(rows.find(r => r.key === "loudness_lufs").status, "измерено");
});

test("Оценка не считает неподписанные поля или отказ от жанра верными ответами", () => {
  const result = compareReference({ genre: ["ambient"], vocal: null, energy: [20, 40] }, { genre: [], vocal: "vocal", energy: 50 });
  assert.equal(result.genre.status, "abstained"); assert.equal(result.vocal.status, "unlabelled");
  assert.equal(result.energy.distance_to_range, 10);
  assert.equal(compareReference({ tempo_bpm: 70 }, { tempo_bpm: 140 }).tempo_bpm.octave_error, "double");
});

test("Стенд проверяет SHA и происхождение референса; без аудио цифр нет", async () => {
  const dir = await mkdtemp(join(tmpdir(), "music-features-test-"));
  try {
    const audio = Buffer.from("synthetic identity fixture, not music");
    const sha256 = createHash("sha256").update(audio).digest("hex");
    await writeFile(join(dir, "audio"), audio);
    await writeFile(join(dir, "before.json"), JSON.stringify({ sha256, normalized: { genres: [{ label: "Dark Jazz", score: 0.9 }] } }));
    const track = { id: "case", permission_confirmed: true, verified_by: "synthetic-test", verified_at: "2026-10-24", audio: "audio", before: "before.json", sha256,
      reference: { genre: ["ambient"], rhythm: null, vocal: null, instruments: null, energy: null, mood: null } };
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ tracks: [track] }));
    const report = await evaluate(join(dir, "manifest.json"), join(dir, "out"));
    assert.equal(report.compared, 1); assert.equal(report.totals.before.genre.error, 1);
    assert.equal(report.totals.after.genre.abstained, 1); assert.equal(report.totals.after.genre.match, 0);
    assert.equal(report.results[0].measured_audio, false);
    // Реальный экспорт БД использует normalized_json. Owner statement задаёт
    // отдельные ограничения, а не полную слушательскую разметку жанров.
    const normalized = { genres: [{ label: "New Age" }, { label: "Ambient" }],
      styles: [{ label: "Dark Jazz" }, { label: "Relaxation Music", research_only: true }],
      technical: { bpm: null, diagnostics: { pulse_accepted: false, bpm_candidate: 70, bpm_candidate_raw: 140 } },
      vocal: { type: "mixed" } };
    await writeFile(join(dir, "before.json"), JSON.stringify({ sha256, normalized_json: normalized }));
    track.reference = {};
    track.reference_evidence = { type: "owner_statement", required_labels: ["Ambient"], excluded_labels: ["Dark Jazz"] };
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ tracks: [track] }));
    const realShape = (await evaluate(join(dir, "manifest.json"), join(dir, "out"))).results[0];
    assert.deepEqual(realShape.before.prediction.genre, ["new age", "ambient"]);
    assert.equal(realShape.before.prediction.vocal, "mixed");
    assert.equal(realShape.before.prediction.rhythm, "uncertain");
    assert.equal(realShape.after.features.features.tempo.value.raw_bpm, 140);
    assert.equal(realShape.before.owner_statement.excluded[0].asserted, true);
    assert.equal(realShape.after.owner_statement.excluded[0].asserted, false);
    assert.equal(realShape.after.owner_statement.required[0].present, true);
    assert.equal(realShape.after.errors.genre.status, "unlabelled");
    assert.equal(realShape.ml_model_rerun, false);
    assert.equal(realShape.comparison_mode, "same_before_run_new_adapter");
    const snapshot = { ...track, sha256: "0".repeat(64) };
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ tracks: [snapshot] }));
    await assert.rejects(evaluate(join(dir, "manifest.json"), join(dir, "out")), /SHA256/);
    track.permission_confirmed = false;
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ tracks: [track] }));
    assert.equal((await evaluate(join(dir, "manifest.json"), join(dir, "out"))).compared, 0);
    const text = await readFile(join(dir, "out/evaluation.md"), "utf8"); assert.match(text, /Сравнено: 0/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Миграция добавляет только изолированную историю, доступ закрыт, старые строки не обновляются", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20270123120000_music_analyzer_feature_overrides.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.music_analyzer_feature_overrides/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS music_analyzer_feature_overrides_run_idx/);
  assert.doesNotMatch(sql, /CREATE POLICY/); // RLS denies clients; service_role bypasses it.
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.music_analyzer_feature_overrides FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /GRANT SELECT, INSERT ON public\.music_analyzer_feature_overrides TO service_role/);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|TRUNCATE)\b(?! RESTRICT)/);
  assert.doesNotMatch(sql, /ALTER TABLE public\.(music_analyzer_runs|music_passport_versions)/);
  for (const path of ["../src/app/api/music-analyzer/runs/reanalyze/route.ts", "../src/app/api/music-analyzer/runs/[id]/features/route.ts"]) {
    const route = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(route, /requireMusicLabApiAccess/);
    assert.match(route, /invalid_origin/);
  }
});


test("DSP v2: gain-invariant percussion exceeds a sustained pad, including very quiet input", () => {
  const scores = { pad: [], clicks: [] };
  for (const gain of [0.001, 10 ** (-6 / 20), 1, 10 ** (3 / 20)]) {
    const pad = new EnvelopeMeter(), clicks = new EnvelopeMeter();
    for (let i = 0; i < 8000 * 12; i++) {
      pad.push(gain * (0.12 * Math.sin(2 * Math.PI * 220 * i / 8000) + 0.06 * Math.sin(2 * Math.PI * 330 * i / 8000)));
      const phase = i % 4000;
      clicks.push(gain * (phase < 800 ? 0.4 * Math.exp(-phase / 180) * Math.sin(2 * Math.PI * 120 * i / 8000) : 0));
    }
    for (const [name, meter] of [["pad", pad], ["clicks", clicks]]) {
      const result = meter.finish();
      assert.equal(result.algorithm_version, "audiolad-dsp:2");
      scores[name].push(result.energy_0_100);
      assert.equal(buildFeatures({ technical: { energy: 0.99, rms_db: -1 } }, result).features.energy_0_100.value, result.energy_0_100);
      assert.equal(buildFeatures({}, { ...result, loudness_lufs: -5 }).features.energy_0_100.value,
        buildFeatures({}, { ...result, loudness_lufs: -40 }).features.energy_0_100.value);
    }
  }
  for (const values of Object.values(scores)) assert.ok(Math.max(...values) - Math.min(...values) <= 3);
  assert.ok(Math.min(...scores.clicks) - Math.max(...scores.pad) >= 20);
});
