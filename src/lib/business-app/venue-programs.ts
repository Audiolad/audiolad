/**
 * Program kinds the venue player may play. Mirrors the SQL filter
 * `bp.kind IN ('spa', 'cafe')` in report_business_spa_player_playback and
 * get_business_owner_player_live_state (migration 20270122130000).
 * Rights are never decided here: tracks still come only from
 * business_spa_program_manifest (ELIGIBLE only).
 */
export const BUSINESS_VENUE_PROGRAM_KINDS = ["spa", "cafe"] as const;
export type BusinessVenueProgramKind = (typeof BUSINESS_VENUE_PROGRAM_KINDS)[number];

export type VenueProgramCandidate = {
  id: string;
  name: string;
  kind: string;
  created_at: string;
};

export function isBusinessVenueProgramKind(kind: unknown): kind is BusinessVenueProgramKind {
  return typeof kind === "string" && (BUSINESS_VENUE_PROGRAM_KINDS as readonly string[]).includes(kind);
}

/**
 * Maps business_locations.business_category to a program kind. Onboarding
 * persists Russian labels («Кафе», «Спа»); older rows use "cafe" / "spa".
 */
const CATEGORY_TO_KIND: Readonly<Record<string, BusinessVenueProgramKind>> = {
  cafe: "cafe",
  "кафе": "cafe",
  "кафе / кофейня": "cafe",
  "кофейня": "cafe",
  spa: "spa",
  "спа": "spa",
};

export function venueProgramKindForCategory(
  businessCategory: string | null | undefined,
): BusinessVenueProgramKind | null {
  const key = (businessCategory ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return CATEGORY_TO_KIND[key] ?? null;
}

/**
 * Deterministic choice for one venue: a program whose kind matches the venue's
 * business_category wins; otherwise the oldest allowed program (the old spa-only
 * behaviour). Ties: created_at, then id.
 */
export function pickVenueProgram<T extends VenueProgramCandidate>(
  programs: readonly T[],
  businessCategory: string | null | undefined,
): T | null {
  const allowed = programs
    .filter((p) => isBusinessVenueProgramKind(p.kind))
    .slice()
    .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.created_at < b.created_at ? -1 : 1));
  if (allowed.length === 0) return null;
  const preferred = venueProgramKindForCategory(businessCategory);
  return (preferred ? allowed.find((p) => p.kind === preferred) : undefined) ?? allowed[0];
}
