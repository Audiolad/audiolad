import type { ListenProgressEntry } from "@/lib/listen/types";

export type GuestPracticeProgress = {
  practiceId: string;
  practiceSlug: string;
  trackId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  started: boolean;
  completed: boolean;
  source: string | null;
  campaign: string | null;
  updatedAt: string;
};

const STORAGE_PREFIX = "audiolad_gp:";
const SAVE_THROTTLE_MS = 12_000;

let lastSaveAt = 0;

export function hasAnyGuestPracticeProgress(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(STORAGE_PREFIX)) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function buildStorageKey(practiceId: string): string {
  return `${STORAGE_PREFIX}${practiceId}`;
}

function isValidProgress(value: unknown): value is GuestPracticeProgress {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.practiceId === "string" &&
    typeof record.practiceSlug === "string" &&
    typeof record.trackId === "string" &&
    typeof record.positionSeconds === "number" &&
    typeof record.started === "boolean" &&
    typeof record.completed === "boolean" &&
    typeof record.updatedAt === "string"
  );
}

export function readGuestPracticeProgress(
  practiceId: string,
): GuestPracticeProgress | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(buildStorageKey(practiceId));

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isValidProgress(parsed) || parsed.practiceId !== practiceId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function guestProgressToListenEntries(
  progress: GuestPracticeProgress | null,
): ListenProgressEntry[] {
  if (!progress) {
    return [];
  }

  return [
    {
      audioItemId: progress.trackId,
      positionSeconds: Math.max(0, Math.floor(progress.positionSeconds)),
      completed: progress.completed,
    },
  ];
}

export function saveGuestPracticeProgress(
  progress: GuestPracticeProgress,
  options?: { force?: boolean },
): void {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();

  if (!options?.force && now - lastSaveAt < SAVE_THROTTLE_MS) {
    return;
  }

  lastSaveAt = now;

  try {
    window.localStorage.setItem(
      buildStorageKey(progress.practiceId),
      JSON.stringify({
        ...progress,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // localStorage unavailable
  }
}

export function clearGuestPracticeProgress(practiceId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(buildStorageKey(practiceId));
  } catch {
    // localStorage unavailable
  }
}

export function buildGuestProgressPayload(input: {
  practiceId: string;
  practiceSlug: string;
  trackId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  started: boolean;
  completed: boolean;
  source?: string | null;
  campaign?: string | null;
}): GuestPracticeProgress {
  const existing = readGuestPracticeProgress(input.practiceId);

  return {
    practiceId: input.practiceId,
    practiceSlug: input.practiceSlug,
    trackId: input.trackId,
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    started: input.started || existing?.started === true,
    completed: input.completed,
    source: input.source ?? existing?.source ?? null,
    campaign: input.campaign ?? existing?.campaign ?? null,
    updatedAt: new Date().toISOString(),
  };
}
