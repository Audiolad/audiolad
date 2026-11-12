/**
 * t1412u – passport sound features for the ordinary-catalog album radio.
 *
 * Source: the ACTIVE, SEALED Music Passport Basic version of each track
 * (music_passport_versions.structured_fields + music_passport_attributes) and the
 * analyzer result that version is bound to (music_analyzer_runs). On production the
 * attribute rows carry only mood/instrument; the ranked genres, styles, moods,
 * instruments, sound character and the published BPM live in the sealed snapshot,
 * and energy lives in the bound analyzer result (analysis_features_v1).
 *
 * Reliability rules:
 * - labels: the shared passport reader (rank weights, top labels only) with the
 *   source run's withholding decisions (research-only / withheld labels are dropped);
 * - BPM: a measured attribute with confidence >= 0.7, else the snapshot's PUBLISHED
 *   value (the analyzer gate passed). Candidate and raw BPM are never read;
 * - energy: a measured attribute (0..1) with confidence >= 0.7, else the analyzer
 *   energy_0_100 while MUSIC_ANALYZER_ENERGY_PUBLIC allows it (preliminary scale);
 * - vocal role: the conservative analyzer projection; unknown stays unknown.
 * Read-only, batched SELECTs; no RPC writes, no analysis, no backfill, no Business rules.
 */
import { chunkIds } from "@/lib/supabase/chunk";
import { publicMusicAnalyzerFeatures, readFeatures } from "@/lib/music-analyzer-runs/features.mjs";
import { sourceTagDecision, type TagDecision, type TagGroup } from "@/lib/music-passport/tag-withholding";

/** A row of music_passport_versions as read here. */
export type RadioPassportVersionRow = {
  id: string;
  audio_item_id: string;
  status: string | null;
  sealed_at: string | null;
  ceased_at: string | null;
  structured_fields: unknown;
  analyzer_run_id?: string | null;
};

/** A row of music_passport_attributes as read here. */
export type RadioPassportAttributeRow = {
  id?: string;
  source_ref?: string | null;
  passport_id: string;
  attribute_key: string;
  origin: string;
  value_numeric: number | string | null;
  value_text: string | null;
  confidence: number | string | null;
};

/** Only the strongest labels of each kind count; analyzer scores are uncalibrated, so the
 * rank is what is comparable (same rule as the other passport consumers). */
export const RADIO_LABEL_TOP = 6;
const RANK_WEIGHTS = [1, 0.85, 0.7, 0.55, 0.45, 0.35] as const;
const bandFactor = (score: number | null) => score === null ? 0.8 : score >= 0.3 ? 1 : score >= 0.2 ? 0.85 : 0.65;
const normalizeLabel = (label: string) => label.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").trim().replace(/\s+/g, " ");

function rankedLabels(items: Array<{ label: string; score: number | null }>) {
  const seen = new Set<string>();
  const out: Array<{ label: string; weight: number }> = [];
  for (const item of items) {
    const label = normalizeLabel(item.label);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    if (out.length >= RADIO_LABEL_TOP) break;
    out.push({ label, weight: Number((RANK_WEIGHTS[out.length] * bandFactor(item.score)).toFixed(4)) });
  }
  return out;
}

function labelItems(value: unknown, group: TagGroup, permits: TagDecision) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || !permits(group, item)) return [];
    const rec = item as { label?: unknown; score?: unknown };
    return typeof rec.label === "string" && rec.label.trim() ? [{ label: rec.label, score: num(rec.score) }] : [];
  });
}

export const RADIO_PASSPORT_MIN_CONFIDENCE = 0.7;

export type RadioPassportFeatures = {
  genres: Array<{ label: string; weight: number }>;
  styles: Array<{ label: string; weight: number }>;
  moods: Array<{ label: string; weight: number }>;
  instruments: Array<{ label: string; weight: number }>;
  character: string | null;
  bpm: number | null;
  energy: number | null;
  vocal: "instrumental" | "vocal" | null;
};

/** Only the parts of normalized_json the reader needs (labels for withholding, energy, voice). */
export const RADIO_RUN_COLUMNS = [
  "id",
  "genres:normalized_json->genres",
  "styles:normalized_json->styles",
  "moods:normalized_json->moods",
  "instruments:normalized_json->instruments",
  "sound_character:normalized_json->sound_character",
  "vocal:normalized_json->vocal",
  "afv_schema:normalized_json->analysis_features_v1->schema_version",
  "afv_energy:normalized_json->analysis_features_v1->features->energy_0_100",
  "afv_vocal:normalized_json->analysis_features_v1->features->vocal_role",
].join(", ");

export type RadioRunRow = {
  id: string;
  genres?: unknown; styles?: unknown; moods?: unknown; instruments?: unknown; sound_character?: unknown;
  vocal?: unknown; afv_schema?: unknown; afv_energy?: unknown; afv_vocal?: unknown;
};

/** Rebuild the minimal normalized shape that readFeatures / sourceTagDecision understand. */
export function radioNormalizedFromRun(row: RadioRunRow | null | undefined): Record<string, unknown> | undefined {
  if (!row) return undefined;
  const features: Record<string, unknown> = {};
  if (row.afv_energy) features.energy_0_100 = row.afv_energy;
  if (row.afv_vocal) features.vocal_role = row.afv_vocal;
  return {
    genres: row.genres, styles: row.styles, moods: row.moods, instruments: row.instruments,
    sound_character: row.sound_character, vocal: row.vocal,
    analysis_features_v1: { schema_version: row.afv_schema, features },
  };
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function measured(attributes: readonly RadioPassportAttributeRow[], key: string): number | null {
  const row = attributes.find((a) => a.attribute_key === key && a.origin === "measured");
  const confidence = num(row?.confidence);
  return confidence !== null && confidence >= RADIO_PASSPORT_MIN_CONFIDENCE ? num(row?.value_numeric) : null;
}

/** Pure: one sealed track passport → radio features, or null (NO_PASSPORT for ranking). */
export function radioFeaturesFromPassport(
  version: RadioPassportVersionRow | null | undefined,
  attributes: readonly RadioPassportAttributeRow[] = [],
  normalized?: unknown,
): RadioPassportFeatures | null {
  if (!version || version.status !== "active" || !version.sealed_at || version.ceased_at) return null;
  const own = attributes.filter((a) => a.passport_id === version.id);
  const facts = version.structured_fields && typeof version.structured_fields === "object" && !Array.isArray(version.structured_fields)
    ? (version.structured_fields as Record<string, unknown>) : {};
  // Withholding decisions come from the analyzer result the passport was sealed from.
  const permits = sourceTagDecision(normalized);
  const attrLabels = (key: string, group: TagGroup) => own
    .filter((a) => a.attribute_key === key && typeof a.value_text === "string" && permits(group, { ...a, label: a.value_text }))
    .map((a) => ({ label: a.value_text as string, score: num(a.confidence) }));
  const pick = (group: TagGroup, attrKey: string | null) => {
    const fromFacts = labelItems(facts[group], group, permits);
    return rankedLabels(fromFacts.length > 0 || !attrKey ? fromFacts : attrLabels(attrKey, group));
  };
  const labels = {
    genres: pick("genres", "genre_class"), styles: pick("styles", null), moods: pick("moods", "mood"),
    instruments: pick("instruments", "instrument"),
    character: facts.sound_character && typeof facts.sound_character === "object"
      ? rankedLabels(labelItems([facts.sound_character], "sound_character", permits)) : [],
  };
  const labelled = labels.genres.length + labels.styles.length + labels.moods.length + labels.instruments.length > 0;
  const bpmFact = facts.bpm && typeof facts.bpm === "object" ? (facts.bpm as Record<string, unknown>) : {};
  let bpm = measured(own, "bpm") ?? num(bpmFact.published);
  if (bpm !== null && (bpm < 40 || bpm > 220)) bpm = null;
  let energy: number | null = null;
  const measuredEnergy = measured(own, "energy");
  if (measuredEnergy !== null && measuredEnergy >= 0 && measuredEnergy <= 1) energy = measuredEnergy * 100;
  const analysis = publicMusicAnalyzerFeatures(readFeatures(normalized));
  const analyzerEnergy = num(analysis?.features.energy_0_100?.value);
  if (energy === null && analyzerEnergy !== null && analyzerEnergy >= 0 && analyzerEnergy <= 100) energy = analyzerEnergy;
  const role = analysis?.features.vocal_role?.value;
  const vocal = role === "instrumental" ? "instrumental" : role === "vocal" || role === "mixed" ? "vocal" : null;
  // Any reliable field is kept; text fills only the fields that are missing.
  if (!labelled && !labels.character.length && energy === null && bpm === null && vocal === null) return null;
  return {
    genres: labels.genres, styles: labels.styles, moods: labels.moods,
    instruments: labels.instruments, character: labels.character[0]?.label ?? null,
    bpm, energy: energy === null ? null : Number(energy.toFixed(2)), vocal,
  };
}

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
/** Minimal PostgREST surface (subset of the Supabase client) so tests can use a fake. */
export type RadioPassportClient = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: readonly string[]) => QueryResult & {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => { not: (column: string, operator: string, value: null) => QueryResult };
        };
      };
    };
  };
};

/** Bounded parallelism: at most `limit` PostgREST requests of one phase at a time. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}
export const RADIO_QUERY_CONCURRENCY = 6;

const VERSION_COLUMNS = "id, audio_item_id, status, sealed_at, ceased_at, structured_fields, analyzer_run_id";
const ATTRIBUTE_COLUMNS = "id, passport_id, attribute_key, origin, value_numeric, value_text, confidence, source_ref";
/** Sealed snapshots are immutable: their features are cached for the process lifetime. */
const featuresByVersion = new Map<string, RadioPassportFeatures | null>();
const VERSION_CACHE_LIMIT = 6000;

/** Batched read: ⌈tracks/50⌉ version requests, then attributes and run excerpts only for
 * versions not yet cached. Version/attribute failures throw (caller: author text). A passport
 * whose source run cannot be read is left out and `complete` is false (caller must not cache). */
export async function queryRadioPassportFeatures(
  client: RadioPassportClient,
  trackIds: readonly string[],
): Promise<{ features: Map<string, RadioPassportFeatures>; complete: boolean }> {
  const ids = [...new Set(trackIds)];
  const versions = (await mapLimit(chunkIds(ids), RADIO_QUERY_CONCURRENCY, async (chunk) => {
    const { data, error } = await client.from("music_passport_versions").select(VERSION_COLUMNS)
      .in("audio_item_id", chunk).eq("status", "active").is("ceased_at", null).not("sealed_at", "is", null);
    if (error || !Array.isArray(data)) throw new Error("album_radio_passport_versions_unavailable");
    return data as RadioPassportVersionRow[];
  })).flat();
  const fresh = versions.filter((v) => !featuresByVersion.has(v.id));
  const attributes = (await mapLimit(chunkIds(fresh.map((v) => v.id), 25), RADIO_QUERY_CONCURRENCY, async (chunk) => {
    const { data, error } = await client.from("music_passport_attributes").select(ATTRIBUTE_COLUMNS).in("passport_id", chunk);
    if (error || !Array.isArray(data)) throw new Error("album_radio_passport_attributes_unavailable");
    return data as RadioPassportAttributeRow[];
  })).flat();
  const runIdFor = (v: RadioPassportVersionRow) => {
    if (v.analyzer_run_id) return v.analyzer_run_id;
    const refs = new Set(attributes.filter((a) => a.passport_id === v.id).flatMap((a) => {
      const match = /^analyzer-run:([0-9a-f-]{36})$/i.exec(a.source_ref ?? "");
      return match ? [match[1]] : [];
    }));
    return refs.size === 1 ? [...refs][0] : null;
  };
  const runIds = [...new Set(fresh.flatMap((v) => { const id = runIdFor(v); return id ? [id] : []; }))];
  const runs = new Map<string, RadioRunRow>();
  // A run read failure is transient: those passports are left out this time (see below).
  await mapLimit(chunkIds(runIds, 20), RADIO_QUERY_CONCURRENCY, async (chunk) => {
    try {
      const { data, error } = await client.from("music_analyzer_runs").select(RADIO_RUN_COLUMNS).in("id", chunk);
      if (!error && Array.isArray(data)) for (const row of data as RadioRunRow[]) runs.set(row.id, row);
    } catch { /* conservative fallback */ }
  });
  const attributesBy = new Map<string, RadioPassportAttributeRow[]>();
  for (const row of attributes) attributesBy.set(row.passport_id, [...(attributesBy.get(row.passport_id) ?? []), row]);
  let complete = true;
  for (const version of fresh) {
    const runId = runIdFor(version);
    const run = runId ? runs.get(runId) : undefined;
    // Fail closed: withholding is decided by the source run, so a passport is used only
    // together with its readable run. No bound run (immutable) → never used (text fallback).
    // A bound run that could not be read → left out now and the batch is incomplete, so the
    // caller does not cache it and the next request retries.
    if (runId && !run) { complete = false; continue; }
    if (featuresByVersion.size >= VERSION_CACHE_LIMIT) featuresByVersion.clear();
    featuresByVersion.set(version.id, run
      ? radioFeaturesFromPassport(version, attributesBy.get(version.id) ?? [], radioNormalizedFromRun(run))
      : null);
  }
  const features = new Map<string, RadioPassportFeatures>();
  for (const version of versions) {
    if (features.has(version.audio_item_id)) continue;
    const cached = featuresByVersion.get(version.id);
    if (cached) features.set(version.audio_item_id, cached);
  }
  return { features, complete };
}
