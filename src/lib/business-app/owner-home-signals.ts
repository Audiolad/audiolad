import type { BusinessPointState } from "@/lib/business-app/point-state";

export type BusinessPlayerHealthStatus =
  | "online"
  | "stale"
  | "offline"
  | "never_seen";

export type BusinessPlayerHealthRow = {
  playerId: string;
  playerCode: string;
  displayName: string | null;
  healthStatus: BusinessPlayerHealthStatus | string;
  secondsSinceHeartbeat: number | null;
  locationId: string | null;
};

export type BusinessOwnerHomeSignals = {
  /** Derived Owner Home chrome state (🟢/🟡/🔴). */
  pointState: BusinessPointState;
  playerCount: number;
  /** Primary health among location-scoped players. */
  primaryHealthStatus: BusinessPlayerHealthStatus | "none";
  secondsSinceHeartbeat: number | null;
  /** Minutes since last heartbeat for stopped copy; null if never seen / no player. */
  stoppedMinutes: number | null;
  /** Latest business PoP occurred_at (ISO), or null. */
  lastBusinessPlayAt: string | null;
  /** Minutes since last business play; null if none. */
  lastPlayMinutesAgo: number | null;
  source: "player_health";
};

export function emptyBusinessOwnerHomeSignals(): BusinessOwnerHomeSignals {
  return {
    pointState: "stopped",
    playerCount: 0,
    primaryHealthStatus: "none",
    secondsSinceHeartbeat: null,
    stoppedMinutes: null,
    lastBusinessPlayAt: null,
    lastPlayMinutesAgo: null,
    source: "player_health",
  };
}

function asHealthStatus(value: unknown): BusinessPlayerHealthStatus | string {
  if (
    value === "online" ||
    value === "stale" ||
    value === "offline" ||
    value === "never_seen"
  ) {
    return value;
  }
  return typeof value === "string" ? value : "never_seen";
}

function rankHealth(status: string): number {
  if (status === "online") return 3;
  if (status === "stale") return 2;
  if (status === "offline") return 1;
  return 0;
}

/**
 * Map A2 player health (+ optional last play age) → Owner Home 🟢/🟡/🔴.
 * Pure — unit-tested. Does not invent rights grants or catalog eligibility.
 */
export function deriveBusinessPointState(input: {
  players: readonly BusinessPlayerHealthRow[];
  locationId?: string | null;
  lastBusinessPlayAt?: string | null;
  nowMs?: number;
}): {
  pointState: BusinessPointState;
  primaryHealthStatus: BusinessPlayerHealthStatus | "none";
  secondsSinceHeartbeat: number | null;
  stoppedMinutes: number | null;
  lastPlayMinutesAgo: number | null;
} {
  const nowMs = input.nowMs ?? Date.now();
  const scoped = input.locationId
    ? input.players.filter(
        (p) => p.locationId == null || p.locationId === input.locationId,
      )
    : [...input.players];

  let lastPlayMinutesAgo: number | null = null;
  if (input.lastBusinessPlayAt) {
    const t = Date.parse(input.lastBusinessPlayAt);
    if (Number.isFinite(t)) {
      lastPlayMinutesAgo = Math.max(0, Math.floor((nowMs - t) / 60_000));
    }
  }

  if (scoped.length === 0) {
    return {
      pointState: "stopped",
      primaryHealthStatus: "none",
      secondsSinceHeartbeat: null,
      stoppedMinutes: null,
      lastPlayMinutesAgo,
    };
  }

  let best = scoped[0]!;
  for (const row of scoped) {
    if (rankHealth(String(row.healthStatus)) > rankHealth(String(best.healthStatus))) {
      best = row;
    }
  }

  const primary = asHealthStatus(best.healthStatus);
  const seconds =
    typeof best.secondsSinceHeartbeat === "number" &&
    Number.isFinite(best.secondsSinceHeartbeat)
      ? Math.max(0, best.secondsSinceHeartbeat)
      : null;
  const stoppedMinutes =
    seconds == null ? null : Math.max(1, Math.floor(seconds / 60));

  if (primary === "online") {
    return {
      pointState: "healthy",
      primaryHealthStatus: "online",
      secondsSinceHeartbeat: seconds,
      stoppedMinutes: null,
      lastPlayMinutesAgo,
    };
  }

  if (primary === "stale") {
    return {
      pointState: "autonomous",
      primaryHealthStatus: "stale",
      secondsSinceHeartbeat: seconds,
      stoppedMinutes: null,
      lastPlayMinutesAgo,
    };
  }

  return {
    pointState: "stopped",
    primaryHealthStatus:
      primary === "offline" || primary === "never_seen" ? primary : "never_seen",
    secondsSinceHeartbeat: seconds,
    stoppedMinutes,
    lastPlayMinutesAgo,
  };
}

export function mapHealthRpcRows(rawRows: unknown): BusinessPlayerHealthRow[] {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const secondsRaw = r.seconds_since_heartbeat;
    const seconds =
      typeof secondsRaw === "number"
        ? secondsRaw
        : typeof secondsRaw === "string" && secondsRaw.trim()
          ? Number(secondsRaw)
          : null;
    return {
      playerId: String(r.player_id ?? ""),
      playerCode: String(r.player_code ?? ""),
      displayName: typeof r.display_name === "string" ? r.display_name : null,
      healthStatus: asHealthStatus(r.health_status),
      secondsSinceHeartbeat:
        seconds != null && Number.isFinite(seconds) ? seconds : null,
      locationId: typeof r.location_id === "string" ? r.location_id : null,
    };
  });
}
