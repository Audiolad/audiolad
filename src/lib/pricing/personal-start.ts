import type { PersonalPromotionStart } from "@/lib/pricing/types";

export type PersonalStartRow = PersonalPromotionStart;

export type StartPersonalCountdownInput = {
  store: PersonalStartRow[];
  promotionId: string;
  visitorId: string;
  userId: string | null;
  now: Date;
  durationSeconds: number;
  id?: string;
};

export type StartPersonalCountdownResult = {
  store: PersonalStartRow[];
  start: PersonalStartRow;
  created: boolean;
};

function toTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function comparePersonalStarts(
  left: PersonalStartRow,
  right: PersonalStartRow,
): number {
  const leftStarted = toTime(left.startedAt) ?? Number.POSITIVE_INFINITY;
  const rightStarted = toTime(right.startedAt) ?? Number.POSITIVE_INFINITY;

  if (leftStarted !== rightStarted) {
    return leftStarted - rightStarted;
  }

  return left.id.localeCompare(right.id);
}

export function matchingPersonalStarts(
  store: PersonalStartRow[],
  promotionId: string,
  visitorId: string | null,
  userId: string | null,
): PersonalStartRow[] {
  return store
    .filter((start) => {
      if (start.promotionId !== promotionId) {
        return false;
      }

      if (visitorId && start.visitorId === visitorId) {
        return true;
      }

      if (userId && start.userId === userId) {
        return true;
      }

      return false;
    })
    .slice()
    .sort(comparePersonalStarts);
}

export function chooseCanonicalPersonalStart(
  starts: PersonalStartRow[],
  promotionId: string,
): PersonalStartRow | null {
  const matches = starts
    .filter((start) => start.promotionId === promotionId)
    .filter(
      (start) =>
        toTime(start.startedAt) !== null && toTime(start.expiresAt) !== null,
    )
    .sort(comparePersonalStarts);

  return matches[0] ?? null;
}

export function isPersonalStartActive(
  start: PersonalStartRow,
  nowMs: number,
): boolean {
  const startedAt = toTime(start.startedAt);
  const expiresAt = toTime(start.expiresAt);

  return (
    startedAt !== null &&
    expiresAt !== null &&
    nowMs >= startedAt &&
    nowMs < expiresAt
  );
}

/**
 * One-shot bind: attach user_id to the earliest matching start.
 * Never creates a row and never changes started_at / expires_at.
 */
export function bindPersonalStarts(
  store: PersonalStartRow[],
  visitorId: string | null,
  userId: string | null,
): PersonalStartRow[] {
  if (!visitorId || !userId) {
    return store.map((row) => ({ ...row }));
  }

  const promotionIds = new Set(
    store
      .filter((row) => row.visitorId === visitorId || row.userId === userId)
      .map((row) => row.promotionId),
  );

  let next = store.map((row) => ({ ...row }));

  for (const promotionId of promotionIds) {
    const matches = matchingPersonalStarts(next, promotionId, visitorId, userId);
    const winner = matches[0];

    if (!winner) {
      continue;
    }

    next = next.map((row) => {
      if (row.promotionId !== promotionId) {
        return row;
      }

      if (row.id === winner.id) {
        if (row.userId === null) {
          return { ...row, userId };
        }

        return row;
      }

      if (row.userId === userId) {
        return { ...row, userId: null };
      }

      return row;
    });
  }

  return next;
}

function findUniqueConflict(
  store: PersonalStartRow[],
  promotionId: string,
  visitorId: string,
  userId: string | null,
): PersonalStartRow | null {
  const visitorHit = store.find(
    (row) => row.promotionId === promotionId && row.visitorId === visitorId,
  );

  if (visitorHit) {
    return visitorHit;
  }

  if (!userId) {
    return null;
  }

  return (
    store.find(
      (row) => row.promotionId === promotionId && row.userId === userId,
    ) ?? null
  );
}

/**
 * One-shot personal start. If any start already exists for this
 * (promotion, visitor) or (promotion, user), return that original window.
 */
export function startPersonalCountdown(
  input: StartPersonalCountdownInput,
): StartPersonalCountdownResult {
  const visitorId = input.visitorId.trim().toLowerCase();
  let store = input.userId
    ? bindPersonalStarts(input.store, visitorId, input.userId)
    : input.store.map((row) => ({ ...row }));

  const existing = matchingPersonalStarts(
    store,
    input.promotionId,
    visitorId,
    input.userId,
  )[0];

  if (existing) {
    return { store, start: existing, created: false };
  }

  const conflict = findUniqueConflict(
    store,
    input.promotionId,
    visitorId,
    input.userId,
  );

  if (conflict) {
    return { store, start: conflict, created: false };
  }

  const startedAt = input.now.toISOString();
  const expiresAt = new Date(
    input.now.getTime() + input.durationSeconds * 1000,
  ).toISOString();
  const created: PersonalStartRow = {
    id: input.id ?? `start-${startedAt}-${visitorId}`,
    promotionId: input.promotionId,
    visitorId,
    userId: input.userId,
    startedAt,
    expiresAt,
  };

  store = [...store, created];

  if (input.userId) {
    store = bindPersonalStarts(store, visitorId, input.userId);
  }

  const start =
    matchingPersonalStarts(store, input.promotionId, visitorId, input.userId)[0] ??
    created;

  return { store, start, created: true };
}

/**
 * Simulates two concurrent starts against the same snapshot.
 * Unique (promotion, visitor) / (promotion, user) keep a single window.
 */
export function mergeParallelPersonalStarts(
  first: PersonalStartRow,
  second: PersonalStartRow,
): PersonalStartRow[] {
  if (
    first.promotionId === second.promotionId &&
    first.visitorId === second.visitorId
  ) {
    return [comparePersonalStarts(first, second) <= 0 ? first : second];
  }

  if (
    first.promotionId === second.promotionId &&
    first.userId &&
    first.userId === second.userId
  ) {
    return [comparePersonalStarts(first, second) <= 0 ? first : second];
  }

  return [first, second].sort(comparePersonalStarts);
}

export function startsForSubject(
  store: PersonalStartRow[],
  visitorId: string | null,
  userId: string | null,
): PersonalStartRow[] {
  const bound = userId ? bindPersonalStarts(store, visitorId, userId) : store;

  return bound.filter((row) => {
    if (visitorId && row.visitorId === visitorId) {
      return true;
    }

    if (userId && row.userId === userId) {
      return true;
    }

    return false;
  });
}
