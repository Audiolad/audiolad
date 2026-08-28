const DAY_MS = 24 * 60 * 60 * 1000;

export type OperationalTimeRange = {
  snapshotNowIso: string;
  sevenDaysAgoIso: string;
  thirtyDaysAgoIso: string;
};

export function createOperationalTimeRange(
  snapshotNow: Date = new Date(),
): OperationalTimeRange {
  const snapshotNowMs = snapshotNow.getTime();

  return {
    snapshotNowIso: new Date(snapshotNowMs).toISOString(),
    sevenDaysAgoIso: new Date(snapshotNowMs - 7 * DAY_MS).toISOString(),
    thirtyDaysAgoIso: new Date(snapshotNowMs - 30 * DAY_MS).toISOString(),
  };
}

export function countDistinctOwnerUsers(
  members: readonly { user_id: string }[],
): number {
  return new Set(members.map((member) => member.user_id)).size;
}

export function countDistinctOwnerWorkspaces(
  members: readonly { author_id: string }[],
): number {
  return new Set(members.map((member) => member.author_id)).size;
}

export function countPublishedPracticePrograms(
  items: readonly { id: string; practice_id: string }[],
): number {
  const tracksByPractice = new Map<string, Set<string>>();

  for (const item of items) {
    const tracks = tracksByPractice.get(item.practice_id) ?? new Set<string>();
    tracks.add(item.id);
    tracksByPractice.set(item.practice_id, tracks);
  }

  return [...tracksByPractice.values()].filter((tracks) => tracks.size >= 2).length;
}

export function calculateNetRevenueMinor(
  succeededPayments: readonly { amount_minor: number }[],
  confirmedRefunds: readonly { amount_minor: number }[],
): number {
  const grossMinor = succeededPayments.reduce(
    (sum, payment) => sum + payment.amount_minor,
    0,
  );
  const refundedMinor = confirmedRefunds.reduce(
    (sum, refund) => sum + refund.amount_minor,
    0,
  );

  return grossMinor - refundedMinor;
}
