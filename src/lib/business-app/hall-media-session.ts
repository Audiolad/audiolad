/**
 * Locked iPhone in the hall (t1303u, Sergey 09.11.2026): the current track played to the end
 * and the next one never started with the screen off, while Samsung moved on.
 *
 * `lockedAppleScreen()` tells the online player when to hand the next track over before the
 * end (spa-online-player.ts `backgroundAdvance`). `syncPlayerMediaSession()` keeps the page the
 * «Now Playing» owner of the lock screen: title, artist, cover, play / pause / next. Every call
 * is best effort: a browser without the Media Session API, or one that throws, changes nothing.
 */
import { isAppleTouchDevice, type FadeNavigator } from "./player-fade";

type VisibilityDoc = { visibilityState?: string; hidden?: boolean } | null | undefined;

/** Page hidden (screen locked, another app in front) on an iPhone / iPad. */
export function lockedAppleScreen(doc: VisibilityDoc, nav: FadeNavigator | null | undefined): boolean {
  if (!doc) return false;
  const hidden = doc.visibilityState === "hidden" || doc.hidden === true;
  return hidden && isAppleTouchDevice(nav);
}

export type SessionAction = "play" | "pause" | "nexttrack";

type MediaSessionLike = {
  metadata: unknown;
  playbackState?: string;
  setActionHandler(action: string, handler: (() => void) | null): void;
};

export type PlayerSessionState = {
  title: string;
  artist: string;
  artwork: string | null;
  playing: boolean;
  /** «Следующий трек» on the lock screen only where the button is allowed on the page. */
  canNext: boolean;
};

function setHandler(ms: MediaSessionLike, action: string, handler: (() => void) | null): void {
  try {
    ms.setActionHandler(action, handler);
  } catch {
    /* action not supported by this browser */
  }
}

/**
 * Writes the lock screen state. `makeMetadata` builds the browser's MediaMetadata (tests pass
 * a plain object). Null `state`: nothing local plays (owner mirror, closed player), clear it.
 */
export function syncPlayerMediaSession(
  ms: MediaSessionLike | null | undefined,
  state: PlayerSessionState | null,
  run: (action: SessionAction) => void,
  makeMetadata: (init: { title: string; artist: string; artwork: { src: string }[] }) => unknown,
): void {
  if (!ms) return;
  try {
    if (!state) {
      ms.metadata = null;
      if ("playbackState" in ms) ms.playbackState = "none";
      setHandler(ms, "play", null);
      setHandler(ms, "pause", null);
      setHandler(ms, "nexttrack", null);
      return;
    }
    ms.metadata = makeMetadata({
      title: state.title,
      artist: state.artist,
      artwork: state.artwork ? [{ src: state.artwork }] : [],
    });
    if ("playbackState" in ms) ms.playbackState = state.playing ? "playing" : "paused";
    setHandler(ms, "play", () => run("play"));
    setHandler(ms, "pause", () => run("pause"));
    setHandler(ms, "nexttrack", state.canNext ? () => run("nexttrack") : null);
  } catch {
    /* best effort */
  }
}
