export const REPEAT_MODES = ["off", "all", "one"] as const;

export type RepeatMode = (typeof REPEAT_MODES)[number];

export const DEFAULT_REPEAT_MODE: RepeatMode = "off";

export const PLAYER_REPEAT_MODE_STORAGE_KEY = "audiolad:player-repeat-mode";

export const REPEAT_MODE_ARIA_LABELS: Record<RepeatMode, string> = {
  off: "Повтор выключен",
  all: "Повтор очереди",
  one: "Повтор трека",
};

export function isRepeatMode(value: unknown): value is RepeatMode {
  return value === "off" || value === "all" || value === "one";
}

export function parseRepeatMode(value: unknown): RepeatMode {
  return isRepeatMode(value) ? value : DEFAULT_REPEAT_MODE;
}

export function nextRepeatMode(current: RepeatMode): RepeatMode {
  if (current === "off") {
    return "all";
  }

  if (current === "all") {
    return "one";
  }

  return "off";
}

export type NaturalEndedRepeatAction =
  | "replay-one"
  | "auto-next"
  | "restart-effective-queue"
  | "complete";

/**
 * Natural `ended` only. Manual Next/Prev/Select and Media Session nexttrack
 * must not call this — they keep existing non-wrapping semantics.
 */
export function resolveNaturalEndedRepeatAction(input: {
  repeatMode: RepeatMode;
  hasNextInSession: boolean;
}): NaturalEndedRepeatAction {
  if (input.repeatMode === "one") {
    return "replay-one";
  }

  if (input.hasNextInSession) {
    return "auto-next";
  }

  if (input.repeatMode === "all") {
    return "restart-effective-queue";
  }

  return "complete";
}

const repeatModeListeners = new Set<() => void>();

function notifyRepeatModeListeners() {
  for (const listener of repeatModeListeners) {
    listener();
  }
}

export function readStoredRepeatMode(): RepeatMode {
  if (typeof window === "undefined") {
    return DEFAULT_REPEAT_MODE;
  }

  try {
    return parseRepeatMode(
      window.localStorage.getItem(PLAYER_REPEAT_MODE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_REPEAT_MODE;
  }
}

export function getRepeatModeServerSnapshot(): RepeatMode {
  return DEFAULT_REPEAT_MODE;
}

export function subscribePlayerRepeatMode(onStoreChange: () => void): () => void {
  repeatModeListeners.add(onStoreChange);

  if (typeof window === "undefined") {
    return () => {
      repeatModeListeners.delete(onStoreChange);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === PLAYER_REPEAT_MODE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    repeatModeListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeStoredRepeatMode(mode: RepeatMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PLAYER_REPEAT_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable
  }

  notifyRepeatModeListeners();
}
