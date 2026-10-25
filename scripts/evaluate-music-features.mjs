import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFeatures, readFeatures, record } from "../src/lib/music-analyzer-runs/features.mjs";
import { measureLocalAudio } from "../src/lib/music-analyzer-runs/local-dsp.mjs";

const FIELDS = ["genre", "subgenre", "rhythm", "tempo_bpm", "vocal", "instruments", "energy", "mood"];
function labels(list) {
  return Array.isArray(list) ? list.map(v => typeof v === "string" ? v : v.label ?? v.name).filter(Boolean).map(v => v.toLowerCase()) : [];
}
export function predictions(normalized, features = null) {
  const n = record(normalized), t = record(n.technical);
  if (!features) return { genre: labels(n.genres).slice(0, 3), subgenre: labels(n.styles).slice(0, 3),
    rhythm: record(t.diagnostics).pulse_accepted === false ? "uncertain" : typeof t.bpm === "number" ? "pulse_detected" : null, tempo_bpm: t.bpm ?? null,
    vocal: n.vocal_role ?? t.vocal_role ?? record(n.vocal).type ?? null, instruments: labels(n.instruments).slice(0, 10), energy: typeof t.energy === "number" ? t.energy * 100 : null, mood: labels(n.moods).slice(0, 5) };
  const f = features.features;
  const tag = key => Array.isArray(f[key]?.value) ? f[key].value.filter(v => typeof v === "string" || v.status !== "withheld").map(v => typeof v === "string" ? v : v.label).map(v => v.toLowerCase()) : [];
  return { genre: tag("genre"), subgenre: tag("subgenre"), rhythm: f.rhythm_state?.value ?? f.tempo?.value?.rhythm ?? null, tempo_bpm: f.tempo?.value?.bpm ?? null, vocal: f.vocal_role?.value ?? null,
    instruments: tag("instruments"), energy: f.energy_0_100?.value ?? null, mood: tag("mood") };
}

/** Референс null не участвует в знаменателе; abstention не записывается как успех. */
export function compareReference(reference, predicted) {
  return Object.fromEntries(FIELDS.map(key => {
    const ref = reference[key], value = predicted[key];
    if (ref == null) return [key, { status: "unlabelled" }];
    if (value == null || (Array.isArray(value) && !value.length)) return [key, { status: "abstained" }];
    if (key === "tempo_bpm") {
      if (typeof ref !== "number" || ref < 20 || ref > 300) throw new Error("Некорректный референс BPM");
      const ratio = value / ref;
      const octave = Math.abs(ratio - 0.5) < 0.03 ? "half" : Math.abs(ratio - 2) < 0.08 ? "double" : null;
      return [key, { status: Math.abs(ratio - 1) <= 0.04 ? "match" : "error", absolute_error: Math.abs(value - ref), octave_error: octave }];
    }
    if (key === "energy") {
      if (!Array.isArray(ref) || ref.length !== 2 || ref.some(v => typeof v !== "number")) throw new Error("Некорректный диапазон энергии");
      const error = value < ref[0] ? ref[0] - value : value > ref[1] ? value - ref[1] : 0;
      return [key, { status: error ? "error" : "match", distance_to_range: error }];
    }
    if (Array.isArray(ref)) {
      const expected = ref.map(v => v.toLowerCase());
      const actual = Array.isArray(value) ? value : [value];
      const falsePositive = actual.filter(v => !expected.includes(v.toLowerCase()));
      const missed = expected.filter(v => !actual.map(x => x.toLowerCase()).includes(v));
      return [key, { status: falsePositive.length || missed.length ? "error" : "match", false_positive: falsePositive, missed }];
    }
    return [key, { status: ref === value ? "match" : "error" }];
  }));
}

export async function evaluate(manifestPath, outputDir, { ids = [], measure = false } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const tracks = manifest.tracks.filter(t => !ids.length || ids.includes(t.id));
  if (tracks.length > 10 || !tracks.length || ids.some(id => !tracks.some(t => t.id === id))) throw new Error("Нужно явно выбрать от 1 до 10 известных треков");
  const root = dirname(resolve(manifestPath));
  const readJson = async path => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const results = [];
  for (const track of tracks) {
    if (!track.permission_confirmed || !track.verified_by || !track.verified_at || !track.sha256 || !track.before) {
      results.push({ id: track.id, status: "pending_reference_or_input", measured_audio: false }); continue;
    }
    if (!track.audio) { results.push({ id: track.id, status: "pending_audio_identity", measured_audio: false }); continue; }
    const bytes = await readFile(resolve(root, track.audio));
    if (createHash("sha256").update(bytes).digest("hex") !== track.sha256) throw new Error(`SHA256 не совпадает: ${track.id}`);
    const beforeDoc = await readJson(track.before), before = record(beforeDoc.normalized ?? beforeDoc);
    if (beforeDoc.sha256 !== track.sha256) throw new Error(`Исходный паспорт не связан с аудио: ${track.id}`);
    const afterDoc = track.after ? await readJson(track.after) : null;
    if (afterDoc && afterDoc.sha256 !== track.sha256) throw new Error(`Новый паспорт не связан с аудио: ${track.id}`);
    const after = afterDoc ? record(afterDoc.normalized ?? afterDoc) : before;
    const local = measure ? await measureLocalAudio(resolve(root, track.audio)) : {};
    const featureSet = measure ? buildFeatures(after, local) : readFeatures(after) ?? buildFeatures(after);
    const oldPrediction = predictions(before), newPrediction = predictions(after, featureSet);
    results.push({ id: track.id, status: "compared", measured_audio: measure, sha256: track.sha256,
      before: { prediction: oldPrediction, errors: compareReference(track.reference, oldPrediction) },
      after: { prediction: newPrediction, errors: compareReference(track.reference, newPrediction), features: featureSet } });
  }
  const totals = Object.fromEntries(["before", "after"].map(stage => [stage, Object.fromEntries(FIELDS.map(key => {
    const statuses = results.filter(r => r.status === "compared").map(r => r[stage].errors[key].status);
    return [key, Object.fromEntries(["match", "error", "abstained", "unlabelled"].map(status => [status, statuses.filter(s => s === status).length]))];
  }))]));
  const report = { schema_version: "music-eval:1", compared: results.filter(r => r.status === "compared").length, totals, results };
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "evaluation.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(resolve(outputDir, "evaluation.md"), `# Выборочная проверка музыкальных признаков\n\nСравнено: ${report.compared}. Отказ от определения учитывается отдельно от верного ответа.\n\n| Трек | Статус | Аудио измерено в этом запуске |\n| --- | --- | --- |\n${results.map(r => `| ${r.id} | ${r.status === "compared" ? "сравнён" : "ожидает подтверждённого референса и файлов"} | ${r.measured_audio ? "да" : "нет"} |`).join("\n")}\n\nОшибки, пропуски, ложные утверждения и исходные/новые признаки по каждому полю: evaluation.json.\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [manifest, output, ...args] = process.argv.slice(2);
  if (!manifest || !output) throw new Error("Использование: node scripts/evaluate-music-features.mjs <manifest.json> <output-dir> [--ids=id1,id2] [--measure]");
  const ids = args.find(v => v.startsWith("--ids="))?.slice(6).split(",") ?? [];
  const result = await evaluate(manifest, output, { ids, measure: args.includes("--measure") });
  console.log(`Сравнено реальных треков: ${result.compared}. Отчёт: ${output}`);
}
