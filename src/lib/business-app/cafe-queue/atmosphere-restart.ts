/**
 * One-shot handoff from «Создать атмосферу» to the cabinet player.
 *
 * The settings page and the music page do not share a catalog. The button records
 * whether music was already playing. When the music page receives the new queue,
 * it starts at that queue's first track instead of the saved place.
 */

const ATMOSPHERE_RESTART_KEY = "audiolad-business-atmosphere-restart";

export type AtmosphereRestart = {
  /** The mini bar or the music page was already playing when the button was pressed. */
  playing: boolean;
};

type RestartStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStore(): RestartStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markAtmosphereRestart(playing: boolean, store: RestartStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.setItem(ATMOSPHERE_RESTART_KEY, JSON.stringify({ playing }));
  } catch {
    /* private mode: the open music page still applies a queue it already holds */
  }
}

export function clearAtmosphereRestart(store: RestartStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.removeItem(ATMOSPHERE_RESTART_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function peekAtmosphereRestart(store: RestartStore | null = browserStore()): AtmosphereRestart | null {
  if (!store) return null;
  try {
    return parseAtmosphereRestart(store.getItem(ATMOSPHERE_RESTART_KEY));
  } catch {
    return null;
  }
}

export function takeAtmosphereRestart(store: RestartStore | null = browserStore()): AtmosphereRestart | null {
  const value = peekAtmosphereRestart(store);
  if (value) clearAtmosphereRestart(store);
  return value;
}

export function parseAtmosphereRestart(raw: string | null): AtmosphereRestart | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { playing?: unknown };
    if (!value || typeof value !== "object" || typeof value.playing !== "boolean") return null;
    return { playing: value.playing };
  } catch {
    return null;
  }
}

/** Catalog index of the first id the new queue actually contains. */
export function atmosphereQueueStart(
  tracks: readonly { audioItemId: string }[],
  orderedIds: readonly unknown[],
): number {
  for (const id of orderedIds) {
    if (typeof id !== "string") continue;
    const index = tracks.findIndex((track) => track.audioItemId === id);
    if (index >= 0) return index;
  }
  return 0;
}

/**
 * Where playback goes after «Создать атмосферу».
 * Null means this queue refresh is not that handoff, so the saved place stays.
 * `play` is true when music was already playing: the first track of the new queue must start.
 */
export function atmospherePlaybackPlan(input: {
  tracks: readonly { audioItemId: string }[];
  orderedIds: readonly unknown[];
  restart: AtmosphereRestart | null;
  status: string;
}): { index: number; play: boolean } | null {
  if (!input.restart) return null;
  const index = atmosphereQueueStart(input.tracks, input.orderedIds);
  const play = input.restart.playing || input.status === "playing" || input.status === "loading";
  return { index, play };
}
