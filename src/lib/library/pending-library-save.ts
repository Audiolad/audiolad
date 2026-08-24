export const PENDING_LIBRARY_SAVE_STORAGE_KEY = "audiolad:pending-library-save";
export const PENDING_LIBRARY_SAVE_TTL_MS = 30 * 60 * 1000;

export type PendingLibrarySave = {
  practiceId: string;
  returnPath: string;
  ts: number;
};

export type PendingLibrarySaveStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function createMemoryPendingLibrarySaveStorage(
  initial?: Record<string, string>,
): PendingLibrarySaveStorage {
  const map = new Map(Object.entries(initial ?? {}));

  return {
    getItem(key) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

export function getDefaultPendingLibrarySaveStorage(): PendingLibrarySaveStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isPendingLibrarySaveFresh(
  pending: PendingLibrarySave,
  now = Date.now(),
): boolean {
  return now - pending.ts <= PENDING_LIBRARY_SAVE_TTL_MS;
}

export function parsePendingLibrarySave(raw: unknown): PendingLibrarySave | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const practiceId =
    typeof record.practiceId === "string" ? record.practiceId.trim() : "";
  const returnPath =
    typeof record.returnPath === "string" ? record.returnPath.trim() : "";
  const ts = typeof record.ts === "number" && Number.isFinite(record.ts) ? record.ts : NaN;

  if (!practiceId || !returnPath || !Number.isFinite(ts)) {
    return null;
  }

  return { practiceId, returnPath, ts };
}

export function resolvePendingLibrarySaveReturnPath(
  signInReturnPath: string,
  currentPath = "",
): string {
  const current = currentPath.trim();
  const fallback = signInReturnPath.trim() || "/catalog";

  if (current.startsWith("/practice")) {
    return current;
  }

  if (fallback.startsWith("/practice")) {
    return fallback;
  }

  return current || fallback;
}

export function writePendingLibrarySave(input: {
  practiceId: string;
  returnPath: string;
  ts?: number;
  storage?: PendingLibrarySaveStorage | null;
}): PendingLibrarySave | null {
  const practiceId = input.practiceId.trim();
  const returnPath = input.returnPath.trim();

  if (!practiceId || !returnPath) {
    return null;
  }

  const pending: PendingLibrarySave = {
    practiceId,
    returnPath,
    ts: input.ts ?? Date.now(),
  };
  const storage = input.storage ?? getDefaultPendingLibrarySaveStorage();

  if (!storage) {
    return pending;
  }

  try {
    storage.setItem(PENDING_LIBRARY_SAVE_STORAGE_KEY, JSON.stringify(pending));
    return pending;
  } catch {
    return pending;
  }
}

export function readPendingLibrarySave(input?: {
  storage?: PendingLibrarySaveStorage | null;
  now?: number;
}): PendingLibrarySave | null {
  const storage = input?.storage ?? getDefaultPendingLibrarySaveStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(PENDING_LIBRARY_SAVE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const pending = parsePendingLibrarySave(JSON.parse(raw) as unknown);

    if (!pending || !isPendingLibrarySaveFresh(pending, input?.now ?? Date.now())) {
      clearPendingLibrarySave({ storage });
      return null;
    }

    return pending;
  } catch {
    clearPendingLibrarySave({ storage });
    return null;
  }
}

export function clearPendingLibrarySave(input?: {
  storage?: PendingLibrarySaveStorage | null;
}): void {
  const storage = input?.storage ?? getDefaultPendingLibrarySaveStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(PENDING_LIBRARY_SAVE_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable
  }
}
