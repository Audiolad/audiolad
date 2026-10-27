/**
 * Sound signals for one cafe track.
 *
 * Energy (0–100) is read from the analyzer RESULT, not from the passport table:
 * `music_analyzer_runs.normalized_json.analysis_features_v1.features.energy_0_100`
 * (`readFeatures` in src/lib/music-analyzer-runs/features.mjs). The passport copy
 * `structured_fields.energy` and `music_passport_attributes.energy` are ignored:
 * the analyzer writes the 0–100 value onto the result, and the passport attribute
 * is empty for these runs.
 *
 * Mood, genre, style and instrument tags reuse the guest-coffee passport reader.
 * BPM is dropped (too rare to trust). Voice and instrumental labels are never read.
 * Loudness prefers the sealed passport LUFS, then the same analysis result.
 */
import { readFeatures } from "@/lib/music-analyzer-runs/features.mjs";
import {
  guestCoffeeFeaturesFromPassport,
  type GuestCoffeePassportAttributeRow,
  type GuestCoffeePassportVersionRow,
  type GuestCoffeeSoundFeatures,
} from "@/lib/business-app/guest-coffee/passport-features";

export type CafeTrackSignals = {
  hasPassport: boolean;
  /** Analyzer energy 0–100, or null when the result has none. */
  energy: number | null;
  loudnessLufs: number | null;
  /** Tag basis for mood match. BPM and the passport energy slot are always null. */
  sound: GuestCoffeeSoundFeatures | null;
};

function finiteIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

/** Energy from the stored analysis result. Null when the result has no usable 0–100 value. */
export function readCafeAnalyzerEnergy(normalized: unknown): number | null {
  const features = readFeatures(normalized);
  return finiteIn(features?.features.energy_0_100?.value, 0, 100);
}

function readFeatureLoudness(normalized: unknown): number | null {
  const features = readFeatures(normalized);
  return finiteIn(features?.features.loudness_lufs?.value, -70, 5);
}

export function readCafeLoudness(structuredFields: unknown, normalized: unknown): number | null {
  if (structuredFields && typeof structuredFields === "object" && !Array.isArray(structuredFields)) {
    const stored = finiteIn((structuredFields as { loudness_lufs?: unknown }).loudness_lufs, -70, 5);
    if (stored !== null) return stored;
  }
  return readFeatureLoudness(normalized);
}

export function cafeSignalsFromPassport(
  version: GuestCoffeePassportVersionRow | null | undefined,
  attributes: readonly GuestCoffeePassportAttributeRow[] = [],
  normalized?: unknown,
): CafeTrackSignals {
  const parsed = version ? guestCoffeeFeaturesFromPassport(version, attributes, normalized) : null;
  const sound = parsed ? { ...parsed, bpm: null, energy: null } : null;
  return {
    hasPassport: sound !== null,
    energy: readCafeAnalyzerEnergy(normalized),
    loudnessLufs: readCafeLoudness(version?.structured_fields, normalized),
    sound,
  };
}
