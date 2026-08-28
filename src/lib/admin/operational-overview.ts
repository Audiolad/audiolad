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
