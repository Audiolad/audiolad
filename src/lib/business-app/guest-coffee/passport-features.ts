/**
 * a8240527 (passport stage, Sergey 17.10.2026) – turns ONE verified track passport into the
 * hidden sound features of the coffee-shop recommendations. Pure; used on the server only
 * (passport.server.ts) and in unit tests. Nothing from here is ever sent to the browser.
 *
 * Source: the ACTIVE, SEALED Music Passport Basic version of the track (#690,
 * music_passport_versions / music_passport_attributes) with its analyzer snapshot
 * (structured_fields, #845). An album passport is an aggregate of these same track versions,
 * so the recommendations aggregate the track versions themselves – only over the tracks that
 * are really on the shelf.
 *
 * Reliability rules (Sergey's clarifications 5ff3ce84 / d1e867c1):
 * - genres / styles / moods / instruments / sound character: analyzer labels, weighted by
 *   their rank (the analyzer scores are raw, uncalibrated similarities, so the rank is what
 *   is comparable); labels outside the top ones are ignored;
 * - BPM: ONLY a measured, published value with confidence >= GUEST_COFFEE_BPM_MIN_CONFIDENCE.
 *   Candidates and raw values (e.g. «Солнечное утро в Риме»: 85.2 low-confidence candidate,
 *   raw 170.5 failed the gate) are never read;
 * - energy: only a measured value with enough confidence (none is written today);
 * - key / mode / loudness: never used – they carry no emotional meaning here.
 */

export const GUEST_COFFEE_BPM_MIN_CONFIDENCE = 0.6;
export const GUEST_COFFEE_ENERGY_MIN_CONFIDENCE = 0.6;
/** Only the strongest labels of each kind count. */
export const GUEST_COFFEE_LABEL_TOP = 6;
const RANK_WEIGHTS = [1, 0.85, 0.7, 0.55, 0.45, 0.35] as const;

export type GuestCoffeeLabelWeight = { label: string; weight: number };

export type GuestCoffeeSoundFeatures = {
  genres: GuestCoffeeLabelWeight[];
  styles: GuestCoffeeLabelWeight[];
  moods: GuestCoffeeLabelWeight[];
  instruments: GuestCoffeeLabelWeight[];
  character: GuestCoffeeLabelWeight[];
  /** Reliable measured BPM or null. */
  bpm: number | null;
  /** Reliable measured energy (0..1) or null. */
  energy: number | null;
};

/** A row of music_passport_versions as read by the server adapter. */
export type GuestCoffeePassportVersionRow = {
  id: string;
  audio_item_id: string;
  status: string | null;
  sealed_at: string | null;
  ceased_at: string | null;
  structured_fields: unknown;
};

/** A row of music_passport_attributes as read by the server adapter. */
export type GuestCoffeePassportAttributeRow = {
  id?: string;
  passport_id: string;
  attribute_key: string;
  origin: string;
  value_numeric: number | string | null;
  value_text: string | null;
  confidence: number | string | null;
};

/** «Smooth Jazz», «smooth_jazz», «Funk/Soul» → «smooth jazz», «funk soul». */
export function normalizeGuestCoffeeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function bandFactor(score: number | null): number {
  if (score === null) return 0.8;
  if (score >= 0.3) return 1;
  if (score >= 0.2) return 0.85;
  return 0.65;
}

function rankedLabels(items: Array<{ label: string; score: number | null }>): GuestCoffeeLabelWeight[] {
  const seen = new Set<string>();
  const out: GuestCoffeeLabelWeight[] = [];
  for (const item of items) {
    const label = normalizeGuestCoffeeLabel(item.label);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const rank = out.length;
    if (rank >= GUEST_COFFEE_LABEL_TOP) break;
    out.push({ label, weight: Number((RANK_WEIGHTS[rank] * bandFactor(item.score)).toFixed(4)) });
  }
  return out;
}

function labelItems(value: unknown): Array<{ label: string; score: number | null }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ label: string; score: number | null }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as { label?: unknown; score?: unknown };
    if (typeof rec.label !== "string" || !rec.label.trim()) continue;
    out.push({ label: rec.label, score: num(rec.score) });
  }
  return out;
}

/**
 * Features of one track, or null when the track has no usable passport (no active sealed
 * version, or a snapshot without any sound labels). null means NO_PASSPORT for ranking:
 * the editorial reserve is used for it.
 */
export function guestCoffeeFeaturesFromPassport(
  version: GuestCoffeePassportVersionRow | null | undefined,
  attributes: readonly GuestCoffeePassportAttributeRow[] = [],
): GuestCoffeeSoundFeatures | null {
  if (!version) return null;
  if (version.status !== "active" || !version.sealed_at || version.ceased_at) return null;
  const facts = version.structured_fields && typeof version.structured_fields === "object" && !Array.isArray(version.structured_fields)
    ? (version.structured_fields as Record<string, unknown>)
    : {};
  const own = attributes.filter((a) => a.passport_id === version.id);
  const attrLabels = (key: string) =>
    own
      .filter((a) => a.attribute_key === key && typeof a.value_text === "string")
      .map((a) => ({ label: a.value_text as string, score: num(a.confidence) }));

  // The analyzer snapshot keeps the ranked lists; the attribute rows are the same labels
  // (slugs) and serve as the source when a snapshot has none.
  const pick = (factsKey: string, attrKey: string | null) => {
    const fromFacts = labelItems(facts[factsKey]);
    return rankedLabels(fromFacts.length > 0 || !attrKey ? fromFacts : attrLabels(attrKey));
  };
  const character = facts.sound_character && typeof facts.sound_character === "object"
    ? rankedLabels(labelItems([facts.sound_character]))
    : [];

  const features: GuestCoffeeSoundFeatures = {
    genres: pick("genres", "genre_class"),
    styles: pick("styles", null),
    moods: pick("moods", "mood"),
    instruments: pick("instruments", "instrument"),
    character,
    bpm: null,
    energy: null,
  };

  // Tempo: ONLY a measured, published BPM with enough confidence. structured_fields.bpm
  // candidate / raw are never read; the published snapshot value without a measured
  // attribute row has no confidence, so it is not used either.
  const bpmRow = own.find((a) => a.attribute_key === "bpm" && a.origin === "measured");
  const bpm = num(bpmRow?.value_numeric);
  const bpmConfidence = num(bpmRow?.confidence);
  if (bpm !== null && bpmConfidence !== null && bpmConfidence >= GUEST_COFFEE_BPM_MIN_CONFIDENCE && bpm >= 40 && bpm <= 220) {
    features.bpm = bpm;
  }
  const energyRow = own.find((a) => a.attribute_key === "energy" && a.origin === "measured");
  const energy = num(energyRow?.value_numeric);
  const energyConfidence = num(energyRow?.confidence);
  if (energy !== null && energyConfidence !== null && energyConfidence >= GUEST_COFFEE_ENERGY_MIN_CONFIDENCE && energy >= 0 && energy <= 1) {
    features.energy = energy;
  }

  const labelled = features.genres.length + features.styles.length + features.moods.length + features.instruments.length;
  return labelled > 0 ? features : null;
}
