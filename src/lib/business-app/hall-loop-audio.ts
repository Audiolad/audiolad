/**
 * iPhone home-screen app in the hall (t1314u, Sergey 09.11.2026): with the screen locked the
 * current track played to its end and the music stayed on pause; Samsung and Safari tabs moved on.
 *
 * Root cause (WebKit bug 261858, still open; same picture in 173332 / 261554): when an <audio>
 * reaches its natural end and nothing else plays, WebKit closes the page's audio session. In a
 * home-screen web app in the background iOS does not let the page open it again: "ended" fires,
 * `src` + `play()` run and even resolve, but nothing sounds until the app is opened. A pause or a
 * seek does not close the session; only a natural end does.
 *
 * So on Apple touch devices the hall element has `loop` on and never ends. The online player
 * (spa-online-player.ts `loopAdvance`) hands the next track over shortly before the end and, as the
 * safety net, on the loop's jump back to 0:00 (seen in timeupdate: WebKit loops without a
 * "seeking" event; "seeking" is handled too) – both while the element is still playing.
 * `navigator.audioSession.type = "playback"` (Safari 16.4+) marks the page's audio as media
 * playback, not ambient sound. Everything here is best effort.
 */
import { isAppleTouchDevice, type FadeNavigator } from "./player-fade";

type LoopMedia = { loop: boolean };
type AudioSessionNavigator = FadeNavigator & { audioSession?: { type?: string } };

/** Turns loop mode on for Apple touch devices. Returns whether it is on. */
export function prepareLoopAudio(media: LoopMedia, nav: AudioSessionNavigator | null | undefined): boolean {
  if (!isAppleTouchDevice(nav)) return false;
  try {
    media.loop = true;
  } catch {
    return false;
  }
  try {
    if (nav?.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback";
  } catch {
    /* older Safari: no Audio Session API */
  }
  return media.loop === true;
}
