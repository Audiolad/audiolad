/** Версионированные признаки. Score модели не является вероятностью. */
export const FEATURE_VERSION = "audiolad-features:1";
export const LOCAL_VERSION = "audiolad-dsp:2";

// Sergey, 25.10.2026 15:05 MSK: publish a preliminary estimate; calibration continues.
export const MUSIC_ANALYZER_ENERGY_PUBLIC = true;

/** Project run features for passports, album/description context and public UI.
 * Preliminary energy remains a candidate, never a calibrated probability.
 * @param {FeatureSet|null} set @returns {FeatureSet|null}
 */
export function publicMusicAnalyzerFeatures(set) {
  if (!set || MUSIC_ANALYZER_ENERGY_PUBLIC) return set;
  return { ...set, features: Object.fromEntries(Object.entries(set.features)
    .filter(([key]) => key !== "energy_0_100")) };
}

/** @typedef {{value: any, confidence: number|null, source: string, model_version: string, origin: 'measured'|'interpreted', status: 'measured'|'candidate'|'unknown'|'manual', reason: string|null}} Feature */
/** @typedef {{schema_version: string, calibration_version: string, model_id?: string|null, features: Record<string, Feature>}} FeatureSet */
/** @param {unknown} v */
export function record(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : {};
}
/** @param {unknown} v */
export function finite(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
/** @param {unknown} v */
function unit(v) { const n = finite(v); return n !== null && n >= 0 && n <= 1 ? n : null; }
/** @param {any} value @param {Partial<Feature>} [meta] @returns {Feature} */
function fact(value, meta = {}) {
  return { value, confidence: null, source: "unavailable", model_version: "unknown", origin: "interpreted",
    status: value === null ? "unknown" : "candidate", reason: null, ...meta };
}

/** Shared withholding rule for automatic tags and passport materialization.
 * @param {unknown} value
 */
export function isWithheldTag(value) {
  const tag = record(value);
  return tag.status === "withheld" || tag.research_only === true
    || (typeof tag.label === "string" && /dark[ _-]*jazz/i.test(tag.label));
}

/** @param {unknown} list @param {string} source @param {string} version @param {number} limit */
function tags(list, source, version, limit) {
  return (Array.isArray(list) ? list : []).slice(0, limit).flatMap(item => {
    const r = record(item);
    const label = typeof item === "string" ? item : r.label ?? r.name ?? r.tag;
    if (typeof label !== "string" || !label.trim()) return [];
    return [fact(label.trim().slice(0, 120), { source, model_version: version,
      confidence: unit(r.confidence), reason: "Оценка сходства не калибрована как вероятность.",
      // Сохраняется отдельно, никогда не копируется в confidence.
      value: { label: label.trim().slice(0, 120), score: finite(r.score ?? r.probability ?? r.weight ?? r.average),
        segment_consistency: unit(r.segment_consistency), research_only: r.research_only === true, status: r.status },
    })];
  });
}

/** @param {unknown} normalized @param {Record<string, any>} [local] @param {string} [modelVersion] @returns {FeatureSet} */
export function buildFeatures(normalized, local = {}, modelVersion = "unknown") {
  const n = record(normalized), t = record(n.technical), d = record(t.diagnostics);
  const version = modelVersion !== "unknown" ? modelVersion : typeof n.analyzer_version === "string" ? n.analyzer_version
    : typeof record(n.analysis).analyzer_version === "string" ? record(n.analysis).analyzer_version : "unknown";
  /** @type {Record<string, Feature>} */
  const features = {};
  const model = { source: "analyzer:normalized", model_version: version };
  const measured = { source: "ffmpeg:ebur128", model_version: local.ffmpeg_version ?? "unknown", origin: /** @type {const} */ ("measured"), status: /** @type {const} */ ("measured") };
  for (const key of ["duration_s", "loudness_lufs", "true_peak_dbtp", "loudness_range_lu"]) {
    const v = finite(local[key]);
    features[key] = fact(v, v === null ? {} : measured);
  }
  if (features.duration_s.value !== null) features.duration_s = fact(local.duration_s, { source: "local:decoded-duration", model_version: LOCAL_VERSION, origin: "measured", status: "measured" });
  if (features.duration_s.value === null && finite(t.duration_s ?? t.duration_seconds) !== null) features.duration_s = fact(t.duration_s ?? t.duration_seconds, { ...model, origin: "measured", status: "measured" });
  if (features.loudness_lufs.value === null && finite(t.lufs ?? t.integrated_lufs) !== null) features.loudness_lufs = fact(t.lufs ?? t.integrated_lufs, { ...model, origin: "measured", status: "measured" });
  if (finite(t.true_peak_dbtp) !== null) features.true_peak_dbtp = fact(t.true_peak_dbtp, { ...model, source: "analyzer:technical.true_peak_dbtp", origin: "measured", status: "measured", reason: "SciPy resample_poly, передискретизация ×4 исходных каналов." });
  for (const key of ["rms_db", "dynamics_db", "spectral_centroid_hz", "spectral_rolloff_hz", "spectral_flatness", "tempo_stability"]) {
    const value = finite(t[key]);
    features[key] = fact(value, value === null ? {} : { ...model, source: `analyzer:technical.${key}`, origin: "measured", status: "measured",
      reason: key === "dynamics_db" ? "Исходный DSP: P95–P5 RMS активных окон выше −60 dBFS; не LRA." : null });
  }
  for (const key of ["rms_dbfs", "sample_peak_dbfs", "dynamic_spread_db", "onset_density", "rhythm_salience", "spectral_flux", "low_band_onset_ratio", "percussive_ratio", "local_spectral_centroid_hz"]) {
    const v = finite(local[key]);
    features[key] = fact(v, v === null ? {} : { source: "local:mono-8khz-dsp", model_version: local.algorithm_version ?? LOCAL_VERSION,
      origin: "measured", status: "measured", reason: key === "dynamic_spread_db" ? "P95–P10 RMS окон 50 мс выше 1% RMS трека; это не LRA." : null });
  }
  const energy = unit(t.energy ?? n.energy);
  const localEnergy = finite(local.energy_0_100);
  const localVersion = typeof local.algorithm_version === "string" ? local.algorithm_version : LOCAL_VERSION;
  features.energy_0_100 = fact(localEnergy ?? (energy !== null ? energy * 100 : null),
    localEnergy !== null ? { source: localVersion === "audiolad-dsp:1" ? "local:rms-onsets" : "local:spectral-rhythm", model_version: localVersion,
      reason: localVersion === "audiolad-dsp:1"
        ? "Историческая RMS-оценка DSP v1; для независимости от громкости нужен повторный анализ DSP v2."
        : "Предварительная оценка, шкала калибруется. Относительная спектральная и ритмическая активность; громкость не входит в оценку." }
      : energy !== null ? { ...model, reason: "Предварительная оценка, шкала калибруется. Историческая шкала 0–1; для независимости от громкости нужен повторный анализ DSP v2." } : {});
  const candidate = finite(t.bpm) ?? finite(d.bpm_candidate) ?? finite(t.bpm_candidate);
  const raw = finite(d.bpm_candidate_raw) ?? finite(t.bpm_raw);
  const salience = finite(local.rhythm_salience);
  const accepted = d.pulse_accepted !== false && t.pulse_accepted !== false;
  const reliablePulse = accepted && salience !== null && salience >= 0.35;
  const reliable = reliablePulse && candidate !== null && candidate >= 20 && candidate <= 300;
  features.rhythm_state = fact(salience === null ? null : reliablePulse ? "pulse_detected" : "uncertain",
    { source: "local:envelope-autocorrelation", model_version: LOCAL_VERSION, reason: "Порог 0.35 – начальная эвристика, не калиброванная вероятность." });
  features.tempo = fact(candidate === null && raw === null ? null : {
    bpm: reliable ? candidate : null, candidate_bpm: candidate, raw_bpm: raw,
    alternatives_bpm: candidate !== null && candidate >= 20 && candidate <= 300 ? [candidate / 2, candidate, candidate * 2].filter(v => v >= 20 && v <= 300) : [],
    octave_factor: finite(d.tempo_octave_factor), rhythm: reliable ? "pulse_detected" : "uncertain",
    confidence_label: typeof t.bpm_confidence === "string" ? t.bpm_confidence : null,
    octave_scores: { half: finite(d.tempo_octave_score_half), raw: finite(d.tempo_octave_score_raw), double: finite(d.tempo_octave_score_double) },
  }, { ...model, confidence: unit(t.bpm_confidence), reason: "Половинный и двойной темп – кандидаты, не выбранный размер пульса." });
  const density = finite(local.onset_density);
  features.perceived_speed = fact(reliablePulse && density !== null ? (density < 0.8 ? "slow" : density < 2 ? "moderate" : "fast") : null,
    { source: "local:onset-density", model_version: LOCAL_VERSION, reason: "Плотность атак независимо от BPM; требуется слуховая калибровка." });
  // Preserve the existing diagnostic API; it is not a speech classification.
  const scores = record(record(n.vocal).scores);
  const speech = finite(record(scores.spoken_word).average);
  const primaryScores = ["instrumental", "vocal", "mixed"].map(k => finite(record(scores[k]).average)).filter(x => x !== null);
  const best = primaryScores.length ? Math.max(...primaryScores) : null;
  features.speech = fact(speech === null ? null : { score: speech, primary_type: n.vocal_role ?? t.vocal_role ?? record(n.vocal).type ?? null,
    speech_leads: best !== null && speech > best + 0.02, ambiguous: best !== null && Math.abs(speech - best) <= 0.02 },
  { ...model, source: "analyzer:vocal.scores.spoken_word", reason: "Диагностика сходства CLAP; не детектор речи." });
  features.vocal_role = conservativeVocal(n, version);
  for (const [key, list] of Object.entries({ genre: n.genres ?? n.genre_top, subgenre: n.styles ?? n.style_top, mood: n.moods ?? n.mood_top, instruments: n.instruments ?? n.instrument_top })) {
    const limit = key === "instruments" ? 10 : key === "mood" ? 5 : 3;
    const candidates = tags(list, `analyzer:normalized.${key}`, version, limit);
    // Удерживаем узкий жанр без независимого подтверждения. Ambient не назначается по имени файла.
    const values = candidates.map(c => ({ ...c.value, confidence: c.confidence, source: c.source, model_version: c.model_version,
      status: isWithheldTag(c.value) ? "withheld" : "candidate" }));
    features[key] = fact(values.length ? values : null, { ...model,
      reason: key === "genre" || key === "subgenre" ? "Жанры – гипотезы. Dark Jazz удержан до ручной проверки; автоматической замены на Ambient нет." : "Гипотезы модели, не измеренные факты." });
  }
  return { schema_version: FEATURE_VERSION, calibration_version: "conservative:1",
    model_id: typeof record(n.analysis).embedding_model === "string" ? record(n.analysis).embedding_model : null, features };
}

const VOICE_RULES = new Set(["panns-voice:1", "panns-voice:2"]);
const VOICE_MODEL = "Cnn14_mAP=0.431.pth";
/** Shown when the detector withholds a label. The value itself stays null. */
export const VOCAL_UNKNOWN_LABEL = "Не определено";
export const VOCAL_NATURE_REASON = "Похоже на природный шум, не музыка: не инструментал.";

/** CLAP averages are similarities, never probabilities. Fail closed on ties and
 * missing alternatives. These initial gates need listening calibration.
 * @param {Record<string, any>} n @param {string} version @returns {Feature}
 */
function conservativeVocal(n, version) {
  // Versioned AudioSet evidence takes precedence over legacy CLAP similarities.
  // An attempted detector failure must remain unknown, never fall back to CLAP.
  // v1 had no veto or nature rule: never accept "instrumental" from v1.
  const detector = record(record(n.vocal).detector);
  if (Object.hasOwn(record(n.vocal), "detector")) {
    const rule = typeof detector.rule === "string" ? detector.rule : "";
    const blocked = detector.reason === "non_music_nature" || detector.reason === "vocal_veto" || detector.non_music === true;
    const valid = !blocked && VOICE_RULES.has(rule) && detector.status === "ok" && detector.model === VOICE_MODEL
      && detector.confidence_label === "medium" && Array.isArray(detector.windows) && detector.windows.length > 0
      && ["instrumental", "vocal", "spoken", "mixed"].includes(detector.type)
      && record(n.vocal).type === detector.type
      && !(rule === "panns-voice:1" && detector.type === "instrumental");
    return fact(valid ? detector.type : null, { source: `analyzer:vocal.detector:${VOICE_RULES.has(rule) ? rule : "invalid"}`, model_version: detector.model ?? version,
      reason: valid ? "AudioSet, CPU: подтверждающие окна речи/пения. Пороги предварительные; это не калиброванная вероятность."
        : detector.reason === "non_music_nature" ? VOCAL_NATURE_REASON
          : "Детектор голоса не дал уверенного результата или недоступен." });
  }
  const scores = record(record(n.vocal).scores);
  const roles = ["instrumental", "vocal", "spoken_word", "mixed"];
  const ranked = roles.map(role => ({ role, score: unit(record(scores[role]).average) }))
    .filter(row => row.score !== null).sort((a, b) => b.score - a.score);
  let value = null;
  // A primary label alone (including mixed on a near tie) proves no voice.
  if (ranked.length === roles.length) {
    const [first, second] = ranked;
    if (first.score >= 0.35 && first.score - second.score >= 0.08) {
      if (first.role !== "mixed") value = first.role === "spoken_word" ? "spoken" : first.role;
      // Mixed requires positive voice evidence as well as a stable mixed score.
      else if (unit(record(scores.mixed).segment_consistency) >= 0.6
        && record(scores.vocal).average >= 0.35
        && record(scores.vocal).average - record(scores.instrumental).average >= 0.08) value = "mixed";
    }
  }
  return fact(value, { source: "analyzer:vocal.scores:conservative-v2", model_version: version,
    reason: "Гипотеза CLAP, не детектор голоса: нужны все 4 оценки, сходство ≥0.35 и отрыв ≥0.08. Для mixed дополнительно вокал ≥0.35, отрыв от инструментала ≥0.08 и согласованность mixed ≥0.6. Пороги не калиброваны слуховой проверкой; иначе не определено." });
}

/** @param {unknown} normalized @returns {FeatureSet|null} */
export function readFeatures(normalized) {
  const data = record(record(normalized).analysis_features_v1);
  if (data.schema_version !== FEATURE_VERSION || !record(data.features).energy_0_100) return null;
  const set = /** @type {FeatureSet} */ (data);
  // Read-time projection also protects already saved runs, without rewriting ML JSON.
  if (set.features.vocal_role?.status === "manual") return set;
  return { ...set, features: { ...set.features,
    vocal_role: conservativeVocal(record(normalized), set.features.vocal_role?.model_version ?? "unknown") } };
}

const NUMERIC = { energy_0_100: [0, 100], rhythm_salience: [0, 1], dynamic_spread_db: [0, 120], loudness_lufs: [-100, 10], true_peak_dbtp: [-150, 30], duration_s: [0, 86400] };
/** @param {unknown} input @returns {Record<string, any>} */
export function validateOverride(input) {
  const patch = record(input), keys = Object.keys(patch);
  if (!keys.length || keys.length > 12) throw new Error("invalid_override");
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(NUMERIC, key) && !["vocal_role", "genre", "subgenre", "mood", "instruments", "perceived_speed"].includes(key)) throw new Error("invalid_override");
    if (value === null) continue; // Возврат к исходному автоматическому признаку.
    if (Object.hasOwn(NUMERIC, key)) {
      const [min, max] = /** @type {Record<string, number[]>} */ (NUMERIC)[key];
      if (finite(value) === null || value < min || value > max) throw new Error("invalid_override");
    } else if (["genre", "subgenre", "mood", "instruments"].includes(key)) {
      if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== "string" || !v.trim() || v.length > 120)) throw new Error("invalid_override");
    } else if (key === "vocal_role" ? !["instrumental", "vocal", "mixed", "spoken", "unknown"].includes(value) : !["slow", "moderate", "fast", "unknown"].includes(value)) throw new Error("invalid_override");
  }
  return patch;
}

/** @param {FeatureSet} automatic @param {{patch: unknown, id: string|number}[]} overrides @returns {FeatureSet} */
export function applyOverrides(automatic, overrides) {
  const features = { ...automatic.features };
  for (const row of overrides) for (const [key, value] of Object.entries(validateOverride(row.patch))) {
    features[key] = value === null ? automatic.features[key] : fact(value, { status: "manual", source: `manual:${row.id}`, model_version: "manual:1", reason: "Ручная поправка; исходная автоматика сохранена." });
  }
  return { ...automatic, features };
}
