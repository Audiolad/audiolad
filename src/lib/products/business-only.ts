/**
 * Business-only ("только Бизнес") albums – task 39a7ef48.
 *
 * A practice with `business_only = true` is exclusive АудиоЛад Бизнес music:
 * it must never be reachable through the open listener platform (pages,
 * embeds, OG, sitemap, catalog/search, listen APIs, signed audio URLs).
 * It is playable only through the Business hall/point player and visible to
 * its author members and platform admins.
 *
 * Defence in depth: the database also forces such rows to
 * catalog_visibility = 'selected_users' with an empty allowlist, so code that
 * does not know about the flag still treats them as private.
 *
 * Callers that gate public access MUST select `business_only` and use
 * isBusinessOnlyPractice(); the database constraint is the second line.
 */
export type BusinessOnlyFlagRow = {
  business_only?: boolean | null;
};

export function isBusinessOnlyPractice(
  row: BusinessOnlyFlagRow | null | undefined,
): boolean {
  return row?.business_only === true;
}

/** Column list fragment to add to practice selects that gate public access. */
export const BUSINESS_ONLY_COLUMN = "business_only" as const;
