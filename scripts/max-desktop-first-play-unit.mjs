import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  coarseMaxClient,
  describeMaxPlayRejection,
  hasMaxAudioElementSource,
  shouldReflectMaxPlayEvent,
  unlockMaxAudioElementInGesture,
} from "../src/lib/max/max-audio-playback.ts";

/**
 * Model of an embedded Chromium host that locks each media element until a
 * play() call happens inside a user gesture (desktop MAX). A play() outside a
 * gesture on a locked element rejects with NotAllowedError.
 */
class GestureLockedAudio {
  constructor() {
    this.attrs = new Map();
    this.currentSrc = "";
    this.locked = true;
    this.inGesture = false;
    this.paused = true;
    this.playCalls = [];
    this.networkRequests = 0;
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  set src(value) {
    this.attrs.set("src", value);
  }
  removeAttribute(name) {
    this.attrs.delete(name);
    this.currentSrc = "";
  }
  load() {
    this.currentSrc = this.getAttribute("src") ?? "";
  }
  pause() {
    this.paused = true;
  }
  play() {
    this.playCalls.push({ inGesture: this.inGesture, hasSource: hasMaxAudioElementSource(this) });
    if (this.inGesture) {
      this.locked = false;
    }
    if (this.locked) {
      const error = new Error("play() failed because the user didn't interact");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
    this.paused = false;
    if (!hasMaxAudioElementSource(this)) {
      // No source: stays pending until the next load() aborts it.
      return new Promise((_resolve, reject) => {
        queueMicrotask(() => {
          const abort = new Error("interrupted by a new load request");
          abort.name = "AbortError";
          reject(abort);
        });
      });
    }
    this.networkRequests += 1;
    return Promise.resolve();
  }
}

function click(audio, handler) {
  audio.inGesture = true;
  try {
    return handler();
  } finally {
    audio.inGesture = false;
  }
}

const signedUrl = "https://audio.example.test/track.mp3?sig=x";
const fetchSignedUrl = () => new Promise((resolve) => setTimeout(() => resolve(signedUrl), 5));

// The first-press sequence the hook runs: unlock in the click, fetch, set src, play().
async function firstPress(audio, { unlock }) {
  const pending = click(audio, () => {
    if (unlock) unlockMaxAudioElementInGesture(audio);
    return fetchSignedUrl();
  });
  const url = await pending;
  audio.src = url;
  audio.load();
  return audio.play();
}

// Without the unlock (old behaviour) the deferred play() is rejected on the first press.
{
  const audio = new GestureLockedAudio();
  await assert.rejects(firstPress(audio, { unlock: false }), { name: "NotAllowedError" });
  assert.equal(audio.networkRequests, 0);
}

// With the unlock the first gesture starts playback after the signed URL arrives.
{
  const audio = new GestureLockedAudio();
  await firstPress(audio, { unlock: true });
  assert.equal(audio.paused, false);
  assert.equal(audio.networkRequests, 1);
  assert.deepEqual(audio.playCalls[0], { inGesture: true, hasSource: false });
  assert.deepEqual(audio.playCalls[1], { inGesture: false, hasSource: true });
  // Pause, then resume and later plays (e.g. auto-advance) keep working.
  audio.pause();
  await click(audio, () => audio.play());
  assert.equal(audio.paused, false);
  audio.pause();
  await audio.play();
  assert.equal(audio.paused, false);
}

// The unlock never touches an element that already has a source (resume / seek path).
{
  const audio = new GestureLockedAudio();
  audio.src = signedUrl;
  audio.load();
  assert.equal(unlockMaxAudioElementInGesture(audio), false);
  assert.equal(audio.playCalls.length, 0);
}

// The unlock swallows the expected AbortError and synchronous throws.
{
  const audio = new GestureLockedAudio();
  audio.inGesture = true;
  assert.equal(unlockMaxAudioElementInGesture(audio), true);
  audio.inGesture = false;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const throwing = {
    getAttribute: () => null,
    currentSrc: "",
    play() {
      throw new Error("sync");
    },
  };
  assert.equal(unlockMaxAudioElementInGesture(throwing), true);
  assert.equal(
    unlockMaxAudioElementInGesture({ getAttribute: () => null, currentSrc: "", play: () => undefined }),
    true,
  );
}

assert.equal(shouldReflectMaxPlayEvent(false), false);
assert.equal(shouldReflectMaxPlayEvent(true), true);

const macMax =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
assert.equal(coarseMaxClient(macMax), "mac-chrome");
assert.equal(
  coarseMaxClient("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"),
  "ios-safari",
);
assert.equal(coarseMaxClient("Mozilla/5.0 (Linux; Android 14) Chrome/150.0 Mobile Safari/537.36"), "android-chrome");
assert.equal(coarseMaxClient(null), "other-other");
const notAllowed = new Error("x");
notAllowed.name = "NotAllowedError";
assert.deepEqual(describeMaxPlayRejection(notAllowed, macMax, "after_source"), {
  errorName: "NotAllowedError",
  client: "mac-chrome",
  stage: "after_source",
});
assert.equal(describeMaxPlayRejection("boom", macMax, "resume").errorName, "unknown");
assert.equal(describeMaxPlayRejection({ name: "<script>" }, macMax, "resume").errorName, "unknown");

// The hook wires the unlock into the click path, before the fetch starts.
const hook = readFileSync(join(process.cwd(), "src/components/max/useMaxAudioPlayback.ts"), "utf8");
const playFn = hook.slice(hook.indexOf("const play = useCallback"), hook.indexOf("const pause = useCallback"));
assert.match(playFn, /unlockMaxAudioElementInGesture\(audio\)/);
assert.ok(
  playFn.indexOf("unlockMaxAudioElementInGesture(audio)") < playFn.indexOf("void loadTrack(trackIndex, true)"),
  "first press unlocks the element before loadTrack awaits the signed URL",
);
assert.ok(
  playFn.indexOf("shouldStartMaxPrimaryPlayFetch") < playFn.indexOf("unlockMaxAudioElementInGesture(audio)"),
  "a press while preparing does not re-unlock",
);
assert.doesNotMatch(playFn, /await /);
const selectFn = hook.slice(hook.indexOf("const selectTrack = useCallback"), hook.indexOf("const nextTrack = useCallback"));
assert.ok(
  selectFn.indexOf("unlockMaxAudioElementInGesture(audio)") > -1 &&
    selectFn.indexOf("unlockMaxAudioElementInGesture(audio)") < selectFn.indexOf("void loadTrack(index, true)"),
  "a track row press also unlocks inside the gesture",
);
const onPlayFn = hook.slice(hook.indexOf("const onPlay = "), hook.indexOf("const onPlaying = "));
assert.match(onPlayFn, /shouldReflectMaxPlayEvent\(hasMaxAudioElementSource\(audio\)\)/);
assert.equal((hook.match(/reportPlayRejection\(playError/g) ?? []).length, 3);
assert.doesNotMatch(hook, /setError\([^)]*errorName/);
assert.doesNotMatch(hook, /setError\([^)]*playError/);
assert.doesNotMatch(hook, /—/);
assert.match(hook, /const PLAY_START_ERROR = "Не удалось начать воспроизведение\.";/);

console.log("max-desktop-first-play-unit: ok");
