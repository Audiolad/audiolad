/**
 * Automatic AudioLad Business instrumental playlists and selections.
 *
 * Only an explicit v2 detector label or a reviewed manual label counts.
 * Unknown, null, vocal, mixed, spoken, nature, legacy CLAP and panns-voice:1
 * do not. Never treat "not vocal" as instrumental: absent vocal_role is absent,
 * and SQL must use vocal_role = 'instrumental', never COALESCE or IS DISTINCT FROM.
 *
 * Guest-coffee and coffee-atlas shelves are curated by product slug and do not
 * read vocal_role. This helper is the filter for the first automatic selection.
 */

/**
 * @typedef {{ value?: unknown, source?: unknown, status?: unknown }} BusinessVocalFeature
 */

/** @param {BusinessVocalFeature|null|undefined} feature */
function isManualOverride(feature) {
  return feature?.status === "manual" && typeof feature.source === "string" && feature.source.startsWith("manual:");
}

/** Only an explicit, detector-sourced or manually confirmed "instrumental" qualifies.
 * @param {BusinessVocalFeature|null|undefined} feature
 */
export function isInstrumentalForBusiness(feature) {
  if (!feature || feature.value !== "instrumental") return false;
  if (isManualOverride(feature)) return true;
  return feature.source === "analyzer:vocal.detector:panns-voice:2";
}

/** Keep items whose vocal feature is an eligible instrumental. The predicate is equality, not exclusion.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => BusinessVocalFeature|null|undefined} vocalOf
 * @returns {T[]}
 */
export function selectInstrumentalForBusiness(items, vocalOf) {
  return items.filter((item) => isInstrumentalForBusiness(vocalOf(item)));
}
