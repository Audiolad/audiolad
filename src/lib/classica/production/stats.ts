export type ClassicaStatsPeriod = "today" | "week" | "month";

export type ClassicaStatEvent = {
  action: string;
  actorId: string | null;
  operatorId: string | null;
  returnCount: number | null;
  createdAt: string;
};

export type ClassicaStatAccrual = {
  operatorId: string;
  amountMinor: number;
  createdAt: string;
  status: string;
};

export type ClassicaOperatorStats = {
  taken: number;
  submitted: number;
  accepted: number;
  acceptedFirstTry: number;
  returned: number;
  accruedMinor: number;
};

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function moscowPeriodRange(
  period: ClassicaStatsPeriod,
  now: Date,
): { from: Date; to: Date } {
  const shifted = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;

  const start =
    period === "today"
      ? Date.UTC(year, month, day)
      : period === "week"
        ? Date.UTC(year, month, day - mondayOffset)
        : Date.UTC(year, month, 1);

  return {
    from: new Date(start - MOSCOW_OFFSET_MS),
    to: now,
  };
}

function inRange(createdAt: string, from: Date, to: Date): boolean {
  const time = new Date(createdAt).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export function emptyClassicaOperatorStats(): ClassicaOperatorStats {
  return {
    taken: 0,
    submitted: 0,
    accepted: 0,
    acceptedFirstTry: 0,
    returned: 0,
    accruedMinor: 0,
  };
}

export function summarizeClassicaOperatorStats(
  operatorId: string,
  events: readonly ClassicaStatEvent[],
  accruals: readonly ClassicaStatAccrual[],
  from: Date,
  to: Date,
): ClassicaOperatorStats {
  const stats = emptyClassicaOperatorStats();

  for (const event of events) {
    if (!inRange(event.createdAt, from, to)) {
      continue;
    }
    if (event.action === "taken" && event.actorId === operatorId) {
      stats.taken += 1;
    }
    if (event.action === "submitted" && event.actorId === operatorId) {
      stats.submitted += 1;
    }
    if (event.action === "accepted" && event.operatorId === operatorId) {
      stats.accepted += 1;
      if (event.returnCount === 0) {
        stats.acceptedFirstTry += 1;
      }
    }
    if (event.action === "returned" && event.operatorId === operatorId) {
      stats.returned += 1;
    }
  }

  for (const accrual of accruals) {
    if (
      accrual.operatorId === operatorId &&
      accrual.status === "accrued" &&
      inRange(accrual.createdAt, from, to)
    ) {
      stats.accruedMinor += accrual.amountMinor;
    }
  }

  return stats;
}
