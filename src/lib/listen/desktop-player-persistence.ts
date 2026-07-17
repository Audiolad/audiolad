import type { LoadSessionInput } from "./global-player-types";

const STORAGE_KEY = "audiolad:desktop-player-last-session";
const COMPLETION_THRESHOLD_SECONDS = 2;

function isStoredTrackCompleted(
  durationSeconds: number | null,
  positionSeconds: number,
  completed: boolean,
): boolean {
  if (completed) {
    return true;
  }

  return (
    typeof durationSeconds === "number" &&
    durationSeconds > 0 &&
    positionSeconds >= durationSeconds - COMPLETION_THRESHOLD_SECONDS
  );
}

export type DesktopPlayerLastSession = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  updatedAt: string;
  audioItemId?: string;
  positionSeconds?: number;
};

export type DesktopPlayerLastSessionInput = Omit<
  DesktopPlayerLastSession,
  "updatedAt"
>;

function isValidRecord(value: unknown): value is DesktopPlayerLastSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.practiceId === "string" &&
    record.practiceId.length > 0 &&
    typeof record.authorSlug === "string" &&
    record.authorSlug.length > 0 &&
    typeof record.productSlug === "string" &&
    record.productSlug.length > 0 &&
    typeof record.updatedAt === "string"
  );
}

export function readDesktopPlayerLastSession(): DesktopPlayerLastSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isValidRecord(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function mergeDesktopPlaybackIntoSession(
  session: LoadSessionInput,
  snapshot: DesktopPlayerLastSession | null,
): LoadSessionInput {
  if (
    !snapshot ||
    snapshot.practiceId !== session.practiceId ||
    !snapshot.audioItemId ||
    typeof snapshot.positionSeconds !== "number" ||
    !Number.isFinite(snapshot.positionSeconds)
  ) {
    return session;
  }

  const track = session.tracks.find((item) => item.id === snapshot.audioItemId);

  if (!track) {
    return session;
  }

  const duration = track.durationSeconds ?? 0;
  const snapshotPosition = Math.max(0, snapshot.positionSeconds);

  if (
    duration > 0 &&
    snapshotPosition >= duration - COMPLETION_THRESHOLD_SECONDS
  ) {
    return session;
  }

  const merged = new Map(
    session.initialProgress.map((entry) => [entry.audioItemId, entry]),
  );
  const existing = merged.get(snapshot.audioItemId);

  if (
    existing &&
    isStoredTrackCompleted(
      track.durationSeconds,
      existing.positionSeconds,
      existing.completed,
    )
  ) {
    return session;
  }

  const dbPosition = existing?.positionSeconds ?? 0;
  const usePosition = Math.max(dbPosition, Math.floor(snapshotPosition));

  if (duration > 0 && usePosition >= duration - COMPLETION_THRESHOLD_SECONDS) {
    return session;
  }

  merged.set(snapshot.audioItemId, {
    audioItemId: snapshot.audioItemId,
    positionSeconds: usePosition,
    completed: false,
  });

  return {
    ...session,
    initialProgress: [...merged.values()],
  };
}

export function writeDesktopPlayerLastSession(
  input: DesktopPlayerLastSessionInput,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...input,
        updatedAt: new Date().toISOString(),
      } satisfies DesktopPlayerLastSession),
    );
  } catch {
    // localStorage unavailable
  }
}

export function clearDesktopPlayerLastSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}
