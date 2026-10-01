/**
 * Music Passport Basic — product read contract for a future Engine.
 *
 * This is the sonic/measured passport (`get_music_passport_basic`).
 * It is not Rights Passport (`get_music_rights_passport_basic`) and it is
 * not the Music Analyzer Lab (`music_lab_*`).
 *
 * NO_PASSPORT is fail-closed: there is no snapshot to rank on.
 * A present passport still omits unknown attributes. Callers must not
 * treat a missing key as zero, silence, or a rights decision.
 *
 * Storage names `musical_key` and `genre_class` are the stage-1 mapping of
 * the ROADMAP slots "key" and "genre". See docs/DECISIONS.md. Track Identity
 * canon is unchanged.
 */

export const MUSIC_PASSPORT_OBJECT = "music_passport_basic" as const;

export const GET_MUSIC_PASSPORT_BASIC_RPC = "get_music_passport_basic" as const;

export const UPSERT_MUSIC_PASSPORT_BASIC_RPC = "upsert_music_passport_basic" as const;

export const MUSIC_PASSPORT_SCALAR_KEYS = [
  "bpm",
  "musical_key",
  "mode",
  "energy",
  "loudness_lufs",
  "vocal_role",
] as const;

export const MUSIC_PASSPORT_MULTI_KEYS = ["genre_class", "mood", "instrument"] as const;

export type MusicPassportScalarKey = (typeof MUSIC_PASSPORT_SCALAR_KEYS)[number];

export type MusicPassportMultiKey = (typeof MUSIC_PASSPORT_MULTI_KEYS)[number];

export type MusicPassportAttributeKey = MusicPassportScalarKey | MusicPassportMultiKey;

export type MusicPassportOrigin = "measured" | "interpreted";

export type MusicPassportProvenance = "analyzer" | "manual";

export type MusicPassportAttributeValue = {
  value_numeric: number | null;
  value_text: string | null;
  confidence: number | null;
  provenance: MusicPassportProvenance;
  source_ref: string | null;
};

export type MusicPassportSnapshot = {
  id: string;
  version: number;
  analysis_version: string;
  observed_at: string;
  activated_at: string;
  ceased_at: string | null;
  measured: Record<string, MusicPassportAttributeValue | MusicPassportAttributeValue[]>;
  interpreted: Record<string, MusicPassportAttributeValue | MusicPassportAttributeValue[]>;
};

export type MusicPassportBasic = {
  object: typeof MUSIC_PASSPORT_OBJECT;
  audio_item_id: string;
  track_code: string | null;
  as_of: string;
  status: "NO_PASSPORT" | "HAS_PASSPORT";
  passport: MusicPassportSnapshot | null;
};

const SCALAR = new Set<string>(MUSIC_PASSPORT_SCALAR_KEYS);
const MULTI = new Set<string>(MUSIC_PASSPORT_MULTI_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAttributeValue(value: unknown, origin: MusicPassportOrigin): MusicPassportAttributeValue {
  if (!isRecord(value)) {
    throw new Error("music_passport_payload_invalid");
  }
  const provenance = value.provenance;
  if (provenance !== "analyzer" && provenance !== "manual") {
    throw new Error("music_passport_payload_invalid");
  }
  const confidence = value.confidence;
  if (confidence !== null && typeof confidence !== "number") {
    throw new Error("music_passport_payload_invalid");
  }
  if (origin === "measured" && typeof confidence !== "number") {
    throw new Error("music_passport_payload_invalid");
  }
  const valueNumeric = value.value_numeric;
  const valueText = value.value_text;
  if (valueNumeric !== null && typeof valueNumeric !== "number") {
    throw new Error("music_passport_payload_invalid");
  }
  if (valueText !== null && typeof valueText !== "string") {
    throw new Error("music_passport_payload_invalid");
  }
  const sourceRef = value.source_ref;
  if (sourceRef !== null && typeof sourceRef !== "string") {
    throw new Error("music_passport_payload_invalid");
  }
  return {
    value_numeric: valueNumeric,
    value_text: valueText,
    confidence,
    provenance,
    source_ref: sourceRef,
  };
}

function readOriginMap(
  value: unknown,
  origin: MusicPassportOrigin,
): Record<string, MusicPassportAttributeValue | MusicPassportAttributeValue[]> {
  if (!isRecord(value)) {
    throw new Error("music_passport_payload_invalid");
  }
  const out: Record<string, MusicPassportAttributeValue | MusicPassportAttributeValue[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (SCALAR.has(key)) {
      if (Array.isArray(raw)) {
        throw new Error("music_passport_payload_invalid");
      }
      out[key] = readAttributeValue(raw, origin);
      continue;
    }
    if (MULTI.has(key)) {
      if (!Array.isArray(raw)) {
        throw new Error("music_passport_payload_invalid");
      }
      out[key] = raw.map((item) => readAttributeValue(item, origin));
      continue;
    }
    throw new Error("music_passport_payload_invalid");
  }
  return out;
}

export function parseMusicPassportBasic(value: unknown): MusicPassportBasic {
  if (!isRecord(value)) {
    throw new Error("music_passport_payload_invalid");
  }
  if (
    "review_status" in value ||
    "active_grants" in value ||
    "eligible" in value ||
    "decision" in value ||
    "licensed" in value
  ) {
    throw new Error("music_passport_payload_invalid");
  }
  if (value.object !== MUSIC_PASSPORT_OBJECT) {
    throw new Error("music_passport_payload_invalid");
  }
  if (typeof value.audio_item_id !== "string" || typeof value.as_of !== "string") {
    throw new Error("music_passport_payload_invalid");
  }
  if (value.track_code !== null && typeof value.track_code !== "string") {
    throw new Error("music_passport_payload_invalid");
  }
  if (value.status !== "NO_PASSPORT" && value.status !== "HAS_PASSPORT") {
    throw new Error("music_passport_payload_invalid");
  }

  if (value.status === "NO_PASSPORT") {
    if (value.passport !== null) {
      throw new Error("music_passport_payload_invalid");
    }
    return {
      object: MUSIC_PASSPORT_OBJECT,
      audio_item_id: value.audio_item_id,
      track_code: value.track_code,
      as_of: value.as_of,
      status: "NO_PASSPORT",
      passport: null,
    };
  }

  if (!isRecord(value.passport)) {
    throw new Error("music_passport_payload_invalid");
  }
  const passport = value.passport;
  if (
    typeof passport.id !== "string" ||
    typeof passport.version !== "number" ||
    typeof passport.analysis_version !== "string" ||
    typeof passport.observed_at !== "string" ||
    typeof passport.activated_at !== "string"
  ) {
    throw new Error("music_passport_payload_invalid");
  }
  if (passport.ceased_at !== null && typeof passport.ceased_at !== "string") {
    throw new Error("music_passport_payload_invalid");
  }

  return {
    object: MUSIC_PASSPORT_OBJECT,
    audio_item_id: value.audio_item_id,
    track_code: value.track_code,
    as_of: value.as_of,
    status: "HAS_PASSPORT",
    passport: {
      id: passport.id,
      version: passport.version,
      analysis_version: passport.analysis_version,
      observed_at: passport.observed_at,
      activated_at: passport.activated_at,
      ceased_at: passport.ceased_at,
      measured: readOriginMap(passport.measured, "measured"),
      interpreted: readOriginMap(passport.interpreted, "interpreted"),
    },
  };
}

/** True only when a sealed snapshot exists. NO_PASSPORT is not usable. */
export function musicPassportUsableForEngine(payload: MusicPassportBasic): boolean {
  return payload.status === "HAS_PASSPORT" && payload.passport !== null;
}

/**
 * Measured scalar number, or null when the key was not measured.
 * Null is not coerced to 0.
 */
export function measuredNumeric(
  payload: MusicPassportBasic,
  key: "bpm" | "energy" | "loudness_lufs",
): number | null {
  if (!payload.passport) return null;
  const slot = payload.passport.measured[key];
  if (!slot || Array.isArray(slot)) return null;
  return typeof slot.value_numeric === "number" ? slot.value_numeric : null;
}
