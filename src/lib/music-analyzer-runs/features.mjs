/** Версионированные признаки. Score модели не является вероятностью. */
export const FEATURE_VERSION = "audiolad-features:1";
export const LOCAL_VERSION = "audiolad-dsp:1";

// Sergey, 25.10.2026: hide energy until calibration against listener labels.
export const MUSIC_ANALYZER_ENERGY_PUBLIC = false;

/** Project run features for passports, album/description context and public UI.
 * Internal run JSON and manual overrides retain the uncalibrated score.
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
        segment_consistency: unit(r.segment_consistency), research_only: r.research_only === true },
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
  for (const key of ["rms_dbfs", "sample_peak_dbfs", "dynamic_spread_db", "onset_density", "rhythm_salience"]) {
    const v = finite(local[key]);
    features[key] = fact(v, v === null ? {} : { source: "local:mono-8khz-envelope", model_version: LOCAL_VERSION,
      origin: "measured", status: "measured", reason: key === "dynamic_spread_db" ? "P95–P10 RMS непустых окон 50 мс; это не LRA." : null });
  }
  const energy = unit(t.energy ?? n.energy);
  const rmsProxy = finite(t.rms_db);
  const localEnergy = finite(local.energy_0_100) ?? (rmsProxy === null ? null : Math.round(Math.max(0, Math.min(100, (rmsProxy + 60) / 60 * 80))));
  features.energy_0_100 = fact(energy !== null ? energy * 100 : localEnergy,
    energy !== null ? { ...model, reason: "Исходная шкала 0–1; воспринимаемая энергия не проверена." }
      : localEnergy !== null ? { source: finite(local.energy_0_100) !== null ? "local:rms-onsets" : "analyzer:technical.rms_db", model_version: LOCAL_VERSION, reason: "RMS-прокси, при наличии локального измерения дополнен плотностью атак; не калиброван на слушателях." } : {});
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
  const v = record(n.vocal), scores = record(v.scores);
  const primary = n.vocal_role ?? t.vocal_role ?? v.type;
  const speech = finite(record(scores.spoken_word).average);
  const primaryScores = ["instrumental", "vocal", "mixed"].map(k => finite(record(scores[k]).average)).filter(x => x !== null);
  const bestPrimary = primaryScores.length ? Math.max(...primaryScores) : null;
  const speechWins = speech !== null && bestPrimary !== null && speech > bestPrimary + 0.02;
  const speechTie = speech !== null && bestPrimary !== null && Math.abs(speech - bestPrimary) <= 0.02;
  const vocal = speechWins ? "spoken" : speechTie && primary === "instrumental" ? null : primary;
  features.speech = fact(speech === null ? null : { score: speech, primary_type: primary ?? null, speech_leads: speechWins, ambiguous: speechTie },
    { ...model, source: "analyzer:vocal.scores.spoken_word", reason: "Zero-shot cosine; разрыв 0.02 – исследовательская эвристика, не проверенный детектор речи." });
  features.vocal_role = fact(["instrumental", "vocal", "mixed", "spoken"].includes(vocal) ? vocal : null,
    { ...model, source: v.type ? "analyzer:vocal.type+scores" : model.source, confidence: unit(n.vocal_confidence ?? t.vocal_confidence), reason: "Instrumental/vocal/mixed – исходный CLAP; speech – осторожная гипотеза по spoken_word. Отсутствие детектора не означает инструментал." });
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

/** @param {unknown} normalized @returns {FeatureSet|null} */
export function readFeatures(normalized) {
  const data = record(record(normalized).analysis_features_v1);
  return data.schema_version === FEATURE_VERSION && record(data.features).energy_0_100 ? /** @type {FeatureSet} */ (data) : null;
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
