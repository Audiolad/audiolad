/** Access sources that may be removed from Аудиотека in the current product model. */
export const REMOVABLE_LIBRARY_ACCESS_SOURCES = ["free_claim"] as const;

export type RemovableLibraryAccessSource =
  (typeof REMOVABLE_LIBRARY_ACCESS_SOURCES)[number];

/**
 * Server-driven gate for "Удалить из Аудиотеки".
 * Do not infer from is_free / product format — only from access_source.
 */
export function isLibraryMembershipRemovable(
  accessSource: string | null | undefined,
): boolean {
  return accessSource === "free_claim";
}
