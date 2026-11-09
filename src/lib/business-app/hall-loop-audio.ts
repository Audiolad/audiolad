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
 *
 * ROLLED BACK (t1335u, Sergey 09.11.2026 18:38 MSK): on Sergey's iPhone the loop build (#1196,
 * loaded by the #1200 reload at 16:53 MSK) failed both locked-screen boundaries it met (17:04 and
 * 18:30 MSK): the next file was requested, nothing sounded, the page froze. Sergey asked to go one
 * version back, so loop mode is OFF by default (`HALL_LOOP_MODE_ENABLED`) and the hall uses the
 * #1192 path again: early handoff while the screen is locked, "ended" as the fallback. The engine
 * code and its tests stay for a later attempt; only this switch turns it on.
 */
import { isAppleTouchDevice, type FadeNavigator } from "./player-fade";

type LoopMedia = { loop: boolean };
type AudioSessionNavigator = FadeNavigator & { audioSession?: { type?: string } };

/** t1335u: loop mode is rolled back in production (see above). */
export const HALL_LOOP_MODE_ENABLED = false;

/**
 * Turns loop mode on for Apple touch devices when `enabled` (default: HALL_LOOP_MODE_ENABLED,
 * i.e. off). Returns whether it is on. Off: neither `loop` nor the audio session is touched.
 */
export function prepareLoopAudio(
  media: LoopMedia,
  nav: AudioSessionNavigator | null | undefined,
  enabled: boolean = HALL_LOOP_MODE_ENABLED,
): boolean {
  if (!enabled) return false;
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
