import { HALL_MIRROR_FRESH_SECONDS } from "@/lib/business-app/hall-mirror";

/**
 * Owner home «Мои точки» status circles (t1309u).
 * Colour + short Russian label; red only for actionable problems (access ended / playback error).
 * Offline-but-paired stays yellow – without opening hours we must not scare the owner.
 */

export const VENUE_STATUS_COLORS = ["green", "yellow", "red", "grey"] as const;
export type VenueStatusColor = (typeof VENUE_STATUS_COLORS)[number];

export type VenueStatusDot = {
  color: VenueStatusColor;
  /** Short calm label for aria / legend (Russian, en dash). */
  label: string;
};

export type VenueStatusDotInput = {
  /** Non-revoked pairing session exists for this venue. */
  linked: boolean;
  /** Seconds since business_point_sessions.last_seen_at; null if never. */
  secondsSinceSeen: number | null;
  playbackState: "playing" | "paused" | "stopped" | "error" | null;
  /** Account-level trial/paid access is live. */
  accessLive: boolean;
  /** Override freshness window (tests); default = hall mirror 75s. */
  freshSeconds?: number;
  /**
   * Heartbeat is fresh but a "playing" report is too old (unconfirmed).
   * Shown yellow – never green – consistent with #1194 stale-playing rule.
   */
  unconfirmedPlaying?: boolean;
};

export const VENUE_STATUS_LEGEND: ReadonlyArray<VenueStatusDot> = [
  { color: "green", label: "музыка играет" },
  { color: "yellow", label: "музыка остановлена или нет связи с устройством" },
  { color: "red", label: "сбой или закончился доступ" },
  { color: "grey", label: "устройство в зале ещё не подключено" },
];

function deviceFresh(secondsSinceSeen: number | null, freshSeconds: number): boolean {
  return secondsSinceSeen != null && Number.isFinite(secondsSinceSeen) && secondsSinceSeen >= 0 && secondsSinceSeen <= freshSeconds;
}

/**
 * Pure mapping. Priority: access ended → playback error (fresh) → not paired → playing → stopped/paused → offline.
 */
export function deriveVenueStatusDot(input: VenueStatusDotInput): VenueStatusDot {
  const freshSeconds = input.freshSeconds ?? HALL_MIRROR_FRESH_SECONDS;
  const fresh = deviceFresh(input.secondsSinceSeen, freshSeconds);

  if (input.accessLive === false) {
    return { color: "red", label: "закончился доступ" };
  }

  if (fresh && input.playbackState === "error") {
    return { color: "red", label: "сбой воспроизведения" };
  }

  if (!input.linked || input.secondsSinceSeen == null) {
    return { color: "grey", label: "устройство ещё не подключено" };
  }

  if (fresh && input.playbackState === "playing") {
    return { color: "green", label: "музыка играет" };
  }

  // Stale "playing" with a live heartbeat: yellow unconfirmed, never green (#1194 / t1325u).
  if (fresh && input.unconfirmedPlaying) {
    return { color: "yellow", label: "воспроизведение не подтверждено" };
  }

  if (fresh) {
    if (input.playbackState === "paused") {
      return { color: "yellow", label: "музыка на паузе" };
    }
    return { color: "yellow", label: "музыка остановлена" };
  }

  return { color: "yellow", label: "нет связи с устройством" };
}

export type VenueStatusDotRow = {
  locationId: string;
  color: VenueStatusColor;
  label: string;
  /** Hall device JS is older than the current server build. */
  staleBuild?: boolean;
};

/** Apply account access on top of server rows (client already knows chrome access). */
export function applyAccessToVenueDots(
  rows: readonly VenueStatusDotRow[],
  accessLive: boolean,
): VenueStatusDotRow[] {
  if (accessLive) return rows.map((row) => ({ ...row }));
  return rows.map((row) => ({
    locationId: row.locationId,
    color: "red" as const,
    label: "закончился доступ",
    staleBuild: row.staleBuild === true,
  }));
}
