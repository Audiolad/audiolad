/**
 * Scoped analytics delete/count filters for test user reset.
 * Anonymous/session identifiers may be shared across browsers; never delete
 * rows owned by a different registered user_id.
 */

function scopedAnonymousEventFilter(
  anonymousId: string,
  targetUserId: string | null,
): string {
  const ownership =
    targetUserId != null
      ? `or(user_id.is.null,user_id.eq.${targetUserId})`
      : "user_id.is.null";

  return `and(anonymous_session_id.eq.${anonymousId},${ownership})`;
}

function scopedSessionEventFilter(
  sessionId: string,
  targetUserId: string | null,
): string {
  const ownership =
    targetUserId != null
      ? `or(user_id.is.null,user_id.eq.${targetUserId})`
      : "user_id.is.null";

  return `and(session_id.eq.${sessionId},${ownership})`;
}

function scopedAnonymousSessionFilter(
  anonymousId: string,
  targetUserId: string | null,
): string {
  const ownership =
    targetUserId != null
      ? `or(user_id.is.null,user_id.eq.${targetUserId})`
      : "user_id.is.null";

  return `and(anonymous_id.eq.${anonymousId},${ownership})`;
}

function scopedSessionRowFilter(
  sessionId: string,
  targetUserId: string | null,
): string {
  const ownership =
    targetUserId != null
      ? `or(user_id.is.null,user_id.eq.${targetUserId})`
      : "user_id.is.null";

  return `and(id.eq.${sessionId},${ownership})`;
}

export function buildScopedAnalyticsEventFilters(
  targetUserId: string | null,
  anonymousIds: string[],
  sessionIds: string[],
): string[] {
  const filters: string[] = [];

  if (targetUserId) {
    filters.push(`user_id.eq.${targetUserId}`);
  }

  for (const anonymousId of anonymousIds) {
    filters.push(scopedAnonymousEventFilter(anonymousId, targetUserId));
  }

  for (const sessionId of sessionIds) {
    filters.push(scopedSessionEventFilter(sessionId, targetUserId));
  }

  return filters;
}

export function buildScopedAnalyticsSessionFilters(
  targetUserId: string | null,
  anonymousIds: string[],
  sessionIds: string[],
): string[] {
  const filters: string[] = [];

  if (targetUserId) {
    filters.push(`user_id.eq.${targetUserId}`);
  }

  for (const anonymousId of anonymousIds) {
    filters.push(scopedAnonymousSessionFilter(anonymousId, targetUserId));
  }

  for (const sessionId of sessionIds) {
    filters.push(scopedSessionRowFilter(sessionId, targetUserId));
  }

  return filters;
}

export function joinScopedAnalyticsFilters(filters: string[]): string | null {
  return filters.length > 0 ? filters.join(",") : null;
}
