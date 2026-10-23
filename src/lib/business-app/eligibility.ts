/**
 * Business Rights Eligibility helpers (P0-05 UNKNOWN-safe stub).
 * Pure / browser-safe — no server-only imports.
 *
 * Policy: UNKNOWN ≠ ELIGIBLE. Never invent grants/license claims.
 * Full legal seeds / catalog freeze = HG-3/4 + P0-06.
 */

import { VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID } from "@/lib/business-app/venue-player";

export const BUSINESS_ELIGIBILITY_DECISIONS = [
  "ELIGIBLE",
  "INELIGIBLE",
  "CONDITIONAL",
  "UNKNOWN",
] as const;

export type BusinessEligibilityDecision =
  (typeof BUSINESS_ELIGIBILITY_DECISIONS)[number];

export type BusinessEligibilityProbeRow = {
  audioItemId: string;
  label: string;
  decision: BusinessEligibilityDecision;
  trackCode: string | null;
  reasonCodes: string[];
  engineVersion: string | null;
  locationId: string;
  zoneId: string | null;
  error: string | null;
};

/**
 * Slice v0 candidate pool for eligibility probe (read-only).
 * Same audio_item used for PoP evidence bind — NOT a rights grant / not "licensed".
 */
export const BUSINESS_AIRPLAY_CANDIDATE_PROBES: readonly {
  audioItemId: string;
  label: string;
}[] = [
  {
    audioItemId: VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
    label: "Проверочный трек",
  },
];

export function isBusinessEligibilityDecision(
  value: unknown,
): value is BusinessEligibilityDecision {
  return (
    typeof value === "string" &&
    (BUSINESS_ELIGIBILITY_DECISIONS as readonly string[]).includes(value)
  );
}

/** Hard gate for эфир catalog: only explicit ELIGIBLE may enter airplay pool. */
export function isEligibleForVenueAirplay(decision: unknown): boolean {
  return decision === "ELIGIBLE";
}

export function parseBusinessEligibilityPayload(
  data: unknown,
  fallbackAudioItemId: string,
): Omit<BusinessEligibilityProbeRow, "label" | "error"> | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (!isBusinessEligibilityDecision(row.decision)) return null;

  const reasonRaw = row.reason_codes;
  const reasonCodes = Array.isArray(reasonRaw)
    ? reasonRaw.filter((x): x is string => typeof x === "string")
    : [];

  return {
    decision: row.decision,
    audioItemId:
      typeof row.audio_item_id === "string" && row.audio_item_id
        ? row.audio_item_id
        : fallbackAudioItemId,
    trackCode: typeof row.track_code === "string" ? row.track_code : null,
    reasonCodes,
    engineVersion:
      typeof row.engine_version === "string" ? row.engine_version : null,
    locationId: typeof row.location_id === "string" ? row.location_id : "",
    zoneId: typeof row.zone_id === "string" ? row.zone_id : null,
  };
}

export function filterEligibleAirplayRows(
  rows: readonly BusinessEligibilityProbeRow[],
): BusinessEligibilityProbeRow[] {
  return rows.filter(
    (r) => !r.error && isEligibleForVenueAirplay(r.decision),
  );
}

export function venueAirplayEmptyStateCopy(input: {
  hasLocation: boolean;
  probed: boolean;
  eligibleCount: number;
}): { title: string; description: string } {
  if (!input.hasLocation) {
    return {
      title: "Нет точки для проверки прав",
      description:
        "Проверка доступна после подключения заведения.",
    };
  }
  if (!input.probed) {
    return {
      title: "Проверяем права…",
      description:
        "Проверяем разрешение на воспроизведение. Треки без подтверждённых прав в подборку не попадут.",
    };
  }
  if (input.eligibleCount === 0) {
    return {
      title: "Подборка готовится…",
      description:
        "Музыка появится здесь автоматически. Проверочный звук плеера помогает проверить подключение, но не входит в музыкальную подборку.",
    };
  }
  return {
    title: "Доступно для заведения",
    description: `Доступно треков: ${input.eligibleCount}. Права на воспроизведение подтверждены.`,
  };
}

export function formatEligibilityDecisionLabel(
  decision: BusinessEligibilityDecision,
): string {
  switch (decision) {
    case "ELIGIBLE":
      return "Разрешено";
    case "INELIGIBLE":
      return "Недоступно";
    case "CONDITIONAL":
      return "Есть ограничения";
    case "UNKNOWN":
    default:
      return "Нет подтверждения";
  }
}
