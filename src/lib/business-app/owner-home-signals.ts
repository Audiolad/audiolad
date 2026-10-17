import type { SpaPlaybackState } from "./spa-live-report";
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
  lastSeenSeconds?: number | null;
  playbackState?: SpaPlaybackState | null;
  playbackConfirmedAt?: string | null;
  /** Server-computed age of playbackConfirmedAt at load time. */
  playbackConfirmedSecondsAgo?: number | null;
  currentTrack?: { title: string } | null;
  /** Connectivity only; never proof that audio is advancing. */
  liveConnected?: boolean | null;
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
    ...mapOwnerLiveState(null, ""),
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

export type OwnerSignalTone = "neutral" | "ok" | "error";
export type OwnerConnectivitySignal = {
  kind: "closed" | "no_data" | "online" | "offline";
  tone: OwnerSignalTone;
  title: string;
  detail: string;
};

/** Heartbeat proves connectivity only. Opening hours are not available today. */
export function deriveOwnerConnectivitySignal(input: {
  playerCount?: number;
  primaryHealthStatus?: string | null;
  secondsSinceHeartbeat?: number | null;
  isClosedNow?: boolean;
}): OwnerConnectivitySignal {
  if (input.isClosedNow === true) {
    return { kind: "closed", tone: "neutral", title: "Точка закрыта", detail: "Связь с плеером сейчас не требуется." };
  }
  const seconds = input.secondsSinceHeartbeat;
  if (!input.playerCount || !["online", "stale", "offline"].includes(input.primaryHealthStatus ?? "") ||
    seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return { kind: "no_data", tone: "neutral", title: "Нет данных о плеере", detail: "Кабинет пока не получил сигналов от плеера этой точки." };
  }
  if (seconds <= 300) {
    return { kind: "online", tone: "ok", title: "Плеер на связи", detail: "Связь с плеером не подтверждает, что музыка звучит сейчас." };
  }
  return { kind: "offline", tone: "neutral", title: "Нет связи с плеером", detail: "Музыка на точке может продолжать играть." };
}

export type OwnerPlaybackSignalInput = {
  playbackConfirmedAt?: string | null;
  playbackState?: "playing" | "paused" | "stopped" | "error" | null;
  errorConfirmed?: boolean;
  nowMs: number;
};
export type OwnerPlaybackSignal = {
  kind: "confirmed" | "unconfirmed" | "stale" | "paused" | "stopped" | "error";
  tone: OwnerSignalTone;
  title: string;
  detail: string;
};

/** Periodic sound confirmation, independent of heartbeats, PoP and track length. */
export function deriveOwnerPlaybackSignal(input: OwnerPlaybackSignalInput): OwnerPlaybackSignal {
  if (input.errorConfirmed === true) {
    return { kind: "error", tone: "error", title: "Сбой воспроизведения подтверждён", detail: "Откройте плеер точки или обратитесь в поддержку." };
  }
  // Paused/stopped are reported states (caller passes only fresh ones), not sound confirmation.
  if (input.playbackState === "paused" || input.playbackState === "stopped") {
    return { kind: input.playbackState, tone: "neutral", title: input.playbackState === "paused" ? "Воспроизведение на паузе" : "Воспроизведение остановлено", detail: "Плеер точки сообщил это состояние." };
  }
  const confirmedMs = input.playbackConfirmedAt ? Date.parse(input.playbackConfirmedAt) : NaN;
  const ageMs = input.nowMs - confirmedMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { kind: "unconfirmed", tone: "neutral", title: "Воспроизведение не подтверждено", detail: "Кабинет пока не получает подтверждений звука." };
  }
  if (ageMs > 300_000) {
    return { kind: "stale", tone: "neutral", title: "Нет свежего подтверждения звука", detail: "Музыка на точке может продолжать играть." };
  }
  if (input.playbackState === "playing") {
    return { kind: "confirmed", tone: "ok", title: "Воспроизведение подтверждено", detail: "Получено свежее подтверждение от плеера точки." };
  }
  return { kind: "unconfirmed", tone: "neutral", title: "Воспроизведение не подтверждено", detail: "Кабинет пока не получает подтверждений звука." };
}

export const BUSINESS_LIVE_CONNECTIVITY_SECONDS = 5 * 60;

const isoOrNull = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

/**
 * Maps get_business_owner_player_live_state rows. Heartbeat (connectivity), reported playback
 * state and confirmed playing are kept as separate fields. A playback state older than the
 * 5-minute window is dropped (unknown, neutral), never shown as current.
 */
export function mapOwnerLiveState(raw: unknown, organizationId: string, nowMs = Date.now()): Pick<BusinessOwnerHomeSignals,
  "lastSeenSeconds" | "playbackState" | "playbackConfirmedAt" | "playbackConfirmedSecondsAgo" | "currentTrack" | "liveConnected"> {
  const empty = { lastSeenSeconds: null, playbackState: null, playbackConfirmedAt: null, playbackConfirmedSecondsAgo: null, currentTrack: null, liveConnected: null };
  if (!Array.isArray(raw)) return empty;
  const ageS = (iso: string | null) => (iso ? Math.max(0, (nowMs - Date.parse(iso)) / 1000) : null);
  const rows = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && (r as Record<string, unknown>).organization_id === organizationId)
    .map((r) => ({ r, seen: isoOrNull(r.last_seen_at), reported: isoOrNull(r.playback_reported_at) }))
    .filter((x) => x.seen || x.reported)
    .sort((a, b) => Date.parse(b.seen ?? b.reported!) - Date.parse(a.seen ?? a.reported!));
  const top = rows[0];
  if (!top) return empty;
  const lastSeenSeconds = ageS(top.seen);
  const reportedAge = ageS(top.reported);
  const rawState = top.r.playback_state;
  const heartbeatFresh = lastSeenSeconds != null && lastSeenSeconds <= BUSINESS_LIVE_CONNECTIVITY_SECONDS;
  // A recent report is current. A long pause/stop/error stays current while the device is still
  // on the line (it only reports on change). "playing" itself never counts as sound here.
  const stateFresh = (reportedAge != null && reportedAge <= BUSINESS_LIVE_CONNECTIVITY_SECONDS)
    || (heartbeatFresh && reportedAge != null && rawState !== "playing");
  const playbackState: SpaPlaybackState | null = stateFresh && typeof rawState === "string"
    && ["playing", "paused", "stopped", "error"].includes(rawState) ? rawState as SpaPlaybackState : null;
  const confirmedAt = isoOrNull(top.r.playing_confirmed_at);
  return {
    lastSeenSeconds,
    liveConnected: lastSeenSeconds == null ? null : lastSeenSeconds <= BUSINESS_LIVE_CONNECTIVITY_SECONDS,
    playbackState,
    playbackConfirmedAt: confirmedAt,
    playbackConfirmedSecondsAgo: ageS(confirmedAt),
    currentTrack: playbackState && typeof top.r.current_track_title === "string" ? { title: top.r.current_track_title } : null,
  };
}

/** Compact status: connectivity alone never proves sound or a playback failure. */
export function deriveOwnerOverallStatus(
  connectivity: OwnerConnectivitySignal,
  playback: OwnerPlaybackSignal,
): { title: string; tone: OwnerSignalTone } {
  if (playback.tone === "error") return { title: playback.title, tone: "error" };
  if (playback.kind === "confirmed") {
    return { title: "Музыка играет – воспроизведение подтверждено", tone: "ok" };
  }
  return { title: connectivity.title, tone: connectivity.tone === "ok" ? "ok" : "neutral" };
}
