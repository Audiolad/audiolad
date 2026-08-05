const RING_SIZE = 80;
const STORAGE_KEY = "audiolad-player-debug";

type PlayerDebugEntry = {
  ts: number;
  source: string;
  visibilityState: string;
  event: string;
  paused: boolean | null;
  currentTime: number | null;
  readyState: number | null;
  networkState: number | null;
  hasSrc: boolean;
  isPlaying: boolean;
  isRecovering: boolean;
  userWantsPlayback: boolean;
  sessionGeneration: number;
  /** Safe key=value pairs only — never tokens, cookies, or full signed URLs. */
  fields: string | null;
};

const ring: PlayerDebugEntry[] = [];

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (new URLSearchParams(window.location.search).get("debug") === "player") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }

    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function formatDebugFields(
  fields: Record<string, string | number | boolean | null | undefined> | undefined,
): string | null {
  if (!fields) {
    return null;
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }

    parts.push(`${key}=${value === null ? "null" : String(value)}`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export function isPlayerDebugEnabled(): boolean {
  return isDebugEnabled();
}

export function logPlayerDebug(
  source: string,
  event: string,
  snapshot: {
    audio?: HTMLAudioElement | null;
    isPlaying?: boolean;
    isRecovering?: boolean;
    userWantsPlayback?: boolean;
    sessionGeneration?: number;
    fields?: Record<string, string | number | boolean | null | undefined>;
  },
): void {
  if (!isDebugEnabled()) {
    return;
  }

  const audio = snapshot.audio ?? null;
  const entry: PlayerDebugEntry = {
    ts: Date.now(),
    source,
    visibilityState:
      typeof document !== "undefined" ? document.visibilityState : "unknown",
    event,
    paused: audio ? audio.paused : null,
    currentTime: audio ? audio.currentTime : null,
    readyState: audio ? audio.readyState : null,
    networkState: audio ? audio.networkState : null,
    hasSrc: Boolean(audio?.src),
    isPlaying: snapshot.isPlaying ?? false,
    isRecovering: snapshot.isRecovering ?? false,
    userWantsPlayback: snapshot.userWantsPlayback ?? false,
    sessionGeneration: snapshot.sessionGeneration ?? 0,
    fields: formatDebugFields(snapshot.fields),
  };

  ring.push(entry);

  if (ring.length > RING_SIZE) {
    ring.shift();
  }

  try {
    const line = [
      "[player-debug]",
      source,
      event,
      `ready=${entry.readyState}`,
      `net=${entry.networkState}`,
      `hasSrc=${entry.hasSrc}`,
      entry.fields ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    console.info(line);
  } catch {
    // ignore console failures
  }
}

export function getPlayerDebugLogText(): string {
  return ring
    .map((entry) =>
      [
        new Date(entry.ts).toISOString(),
        entry.source,
        entry.visibilityState,
        entry.event,
        `paused=${entry.paused}`,
        `time=${entry.currentTime?.toFixed(2) ?? "n/a"}`,
        `ready=${entry.readyState}`,
        `net=${entry.networkState}`,
        `hasSrc=${entry.hasSrc}`,
        `isPlaying=${entry.isPlaying}`,
        `isRecovering=${entry.isRecovering}`,
        `wants=${entry.userWantsPlayback}`,
        `gen=${entry.sessionGeneration}`,
        entry.fields ?? "",
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
}

export function clearPlayerDebugLog(): void {
  ring.length = 0;
}
