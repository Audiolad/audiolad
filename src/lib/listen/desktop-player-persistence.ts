import {
  isCatalogGlobalPlayerSession,
  isGlobalPlayerEntrySurface,
  normalizeGlobalPlayerSessionContract,
  resolveGlobalPlayerPlaybackMode,
  type CatalogGlobalPlayerSession,
  type GlobalPlayerEntrySurface,
  type GlobalPlayerPlaybackMode,
  type LoadSessionInput,
} from "./global-player-types";

const STORAGE_KEY = "audiolad:desktop-player-last-session";
const COMPLETION_THRESHOLD_SECONDS = 2;

/** Legacy localStorage rows have no version and are treated as 1. */
export const DESKTOP_PLAYER_PERSIST_SCHEMA_VERSION = 2;

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
  version?: number;
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  updatedAt: string;
  audioItemId?: string;
  positionSeconds?: number;
  playbackMode?: GlobalPlayerPlaybackMode;
  entrySurface?: GlobalPlayerEntrySurface;
  previewStartMs?: number;
  previewEndMs?: number;
};

export type DesktopPlayerLastSessionInput = Omit<
  DesktopPlayerLastSession,
  "updatedAt"
>;

function resolvePreviewMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const ms = Math.trunc(value);

  if (ms < 0) {
    return undefined;
  }

  return ms;
}

function hasLegacyIdentity(record: Record<string, unknown>): boolean {
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

export function parseDesktopPlayerLastSession(
  value: unknown,
): DesktopPlayerLastSession | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (!hasLegacyIdentity(record)) {
    return null;
  }

  const parsed: DesktopPlayerLastSession = {
    practiceId: record.practiceId as string,
    authorSlug: record.authorSlug as string,
    productSlug: record.productSlug as string,
    updatedAt: record.updatedAt as string,
    playbackMode: resolveGlobalPlayerPlaybackMode(record.playbackMode),
  };

  if (typeof record.version === "number" && Number.isFinite(record.version)) {
    parsed.version = Math.trunc(record.version);
  }

  if (typeof record.audioItemId === "string" && record.audioItemId.length > 0) {
    parsed.audioItemId = record.audioItemId;
  }

  if (
    typeof record.positionSeconds === "number" &&
    Number.isFinite(record.positionSeconds)
  ) {
    parsed.positionSeconds = record.positionSeconds;
  }

  if (isGlobalPlayerEntrySurface(record.entrySurface)) {
    parsed.entrySurface = record.entrySurface;
  }

  const previewStartMs = resolvePreviewMs(record.previewStartMs);
  const previewEndMs = resolvePreviewMs(record.previewEndMs);

  if (typeof previewStartMs === "number") {
    parsed.previewStartMs = previewStartMs;
  }

  if (typeof previewEndMs === "number") {
    parsed.previewEndMs = previewEndMs;
  }

  return parsed;
}

export function desktopPlayerSnapshotFromSession(
  session: CatalogGlobalPlayerSession,
  extras?: Pick<DesktopPlayerLastSessionInput, "audioItemId" | "positionSeconds">,
): DesktopPlayerLastSessionInput {
  const snapshot: DesktopPlayerLastSessionInput = {
    version: DESKTOP_PLAYER_PERSIST_SCHEMA_VERSION,
    practiceId: session.practiceId,
    authorSlug: session.authorSlug,
    productSlug: session.productSlug,
    playbackMode: resolveGlobalPlayerPlaybackMode(session.playbackMode),
  };

  if (session.entrySurface) {
    snapshot.entrySurface = session.entrySurface;
  }

  if (typeof session.previewStartMs === "number") {
    snapshot.previewStartMs = session.previewStartMs;
  }

  if (typeof session.previewEndMs === "number") {
    snapshot.previewEndMs = session.previewEndMs;
  }

  if (extras?.audioItemId) {
    snapshot.audioItemId = extras.audioItemId;
  }

  if (typeof extras?.positionSeconds === "number") {
    snapshot.positionSeconds = extras.positionSeconds;
  }

  return snapshot;
}

export function applyPersistedSessionContract(
  session: LoadSessionInput,
  snapshot: DesktopPlayerLastSession | null,
): LoadSessionInput {
  if (!isCatalogGlobalPlayerSession(session)) {
    return normalizeGlobalPlayerSessionContract(session);
  }

  if (!snapshot || snapshot.practiceId !== session.practiceId) {
    return normalizeGlobalPlayerSessionContract(session);
  }

  return normalizeGlobalPlayerSessionContract({
    ...session,
    playbackMode: snapshot.playbackMode ?? "full",
    ...(snapshot.entrySurface ? { entrySurface: snapshot.entrySurface } : {}),
    ...(typeof snapshot.previewStartMs === "number"
      ? { previewStartMs: snapshot.previewStartMs }
      : {}),
    ...(typeof snapshot.previewEndMs === "number"
      ? { previewEndMs: snapshot.previewEndMs }
      : {}),
  });
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

    return parseDesktopPlayerLastSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function mergeDesktopPlaybackIntoSession(
  session: LoadSessionInput,
  snapshot: DesktopPlayerLastSession | null,
): LoadSessionInput {
  // Private audio sessions are not restored from desktop localStorage.
  if (!isCatalogGlobalPlayerSession(session)) {
    return session;
  }

  const withContract = applyPersistedSessionContract(session, snapshot);

  if (
    !snapshot ||
    snapshot.practiceId !== session.practiceId ||
    !snapshot.audioItemId ||
    typeof snapshot.positionSeconds !== "number" ||
    !Number.isFinite(snapshot.positionSeconds)
  ) {
    return withContract;
  }

  if (!isCatalogGlobalPlayerSession(withContract)) {
    return withContract;
  }

  const track = withContract.tracks.find((item) => item.id === snapshot.audioItemId);

  if (!track) {
    return withContract;
  }

  const duration = track.durationSeconds ?? 0;
  const snapshotPosition = Math.max(0, snapshot.positionSeconds);

  if (
    duration > 0 &&
    snapshotPosition >= duration - COMPLETION_THRESHOLD_SECONDS
  ) {
    return withContract;
  }

  const merged = new Map(
    withContract.initialProgress.map((entry) => [entry.audioItemId, entry]),
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
    return withContract;
  }

  const dbPosition = existing?.positionSeconds ?? 0;
  const usePosition = Math.max(dbPosition, Math.floor(snapshotPosition));

  if (duration > 0 && usePosition >= duration - COMPLETION_THRESHOLD_SECONDS) {
    return withContract;
  }

  merged.set(snapshot.audioItemId, {
    audioItemId: snapshot.audioItemId,
    positionSeconds: usePosition,
    completed: false,
  });

  return {
    ...withContract,
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
    const normalized = parseDesktopPlayerLastSession({
      ...input,
      updatedAt: new Date().toISOString(),
    });

    if (!normalized) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...normalized,
        version: input.version ?? DESKTOP_PLAYER_PERSIST_SCHEMA_VERSION,
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
