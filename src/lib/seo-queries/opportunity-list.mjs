/**
 * The choosing queue contains own unfinished work followed by free topics.
 * reservationId is populated by the repository only for the opened workspace.
 * Keep the source order within each group, including after an optimistic update.
 * Moderation still occupies an active slot and retains its mutation restrictions.
 *
 * @template {Pick<import("./types").SeoQueryOpportunity, "lifecycle" | "reservationId">} T
 * @param {ReadonlyArray<T>} opportunities
 * @returns {T[]}
 */
export function selectAuthorSeoOpportunities(opportunities) {
  const own = opportunities.filter((item) =>
    Boolean(item.reservationId)
    && (item.lifecycle === "in_progress" || item.lifecycle === "moderation"),
  );
  const free = opportunities.filter((item) =>
    !item.reservationId && item.lifecycle === "available",
  );
  return [...own, ...free];
}
