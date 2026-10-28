#!/usr/bin/env node
/**
 * Desktop catalog scroll must survive Play.
 *
 * Mobile listings scroll the document. That node sits outside the keyed
 * player engine, so starting playback already left window.scrollY alone.
 * Desktop listings scroll `.listener-app-shell__center-scroll` inside the
 * app tree. Wrapping that tree in `<GlobalPlayerEngine key=...>` recreates
 * the scroller and jumps to the top. Play must remount the engine only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPlayerEngineBridge } from "../src/lib/audio/player-engine-bridge";
import {
  readPwaDeviceState,
  writePwaDeviceState,
} from "../src/lib/pwa/storage";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const providerSource = readFileSync(
  join(root, "src/components/audio/GlobalAudioPlayerProvider.tsx"),
  "utf8",
);

function providerReturn(source: string): string {
  const start = source.indexOf("export function GlobalAudioPlayerProvider");
  assert.ok(start >= 0, "GlobalAudioPlayerProvider exists");
  const body = source.slice(start);
  const ret = body.lastIndexOf("return (");
  assert.ok(ret >= 0, "provider has a return");
  return body.slice(ret);
}

/**
 * True when the app tree is a child of the keyed engine and would lose
 * desktop scrollTop on the next playback key.
 */
export function listingScrollResetsOnPlayback(source: string): boolean {
  const start = source.indexOf("export function GlobalAudioPlayerProvider");
  const engineFn = source.indexOf("function GlobalPlayerEngine");
  if (start < 0 || engineFn < 0 || engineFn > start) {
    return true;
  }

  if (source.slice(engineFn, start).includes("{children}")) {
    return true;
  }

  const jsx = providerReturn(source);
  const tag = "<GlobalPlayerEngine";
  const at = jsx.indexOf(tag);
  if (at < 0) {
    return true;
  }

  const openEnd = jsx.indexOf(">", at);
  if (openEnd < 0) {
    return true;
  }

  if (jsx[openEnd - 1] !== "/") {
    const close = jsx.indexOf("</GlobalPlayerEngine>", openEnd);
    if (close < 0) {
      return true;
    }

    const inner = jsx.slice(openEnd + 1, close);
    if (inner.includes("{children}") || /\bchildren\b/.test(inner)) {
      return true;
    }
  }

  const outside = `${jsx.slice(0, at)}\n${jsx.slice(openEnd + 1)}`;
  return !outside.includes("{children}");
}

function scrollAfterPlaybackKey(resets: boolean, scrollTop: number): number {
  return resets ? 0 : scrollTop;
}

const broken = `
function GlobalPlayerEngine() {
  return null;
}
export function GlobalAudioPlayerProvider({ children }) {
  return (
    <SessionContext.Provider value={sessionValue}>
      {session ? (
        <GlobalPlayerEngine key={playbackInstanceId}>
          {children}
        </GlobalPlayerEngine>
      ) : (
        children
      )}
    </SessionContext.Provider>
  );
}
`;

assert.equal(
  listingScrollResetsOnPlayback(broken),
  true,
  "wrapping the listing in the keyed engine resets desktop scroll",
);
assert.equal(
  scrollAfterPlaybackKey(listingScrollResetsOnPlayback(broken), 920),
  0,
  "broken mount jumps a scrolled catalog back to the top",
);

assert.equal(
  listingScrollResetsOnPlayback(providerSource),
  false,
  "Play must not remount the listing that owns desktop scroll",
);
assert.equal(
  scrollAfterPlaybackKey(listingScrollResetsOnPlayback(providerSource), 920),
  920,
  "desktop catalog scroll survives a playback engine key change",
);

assert.match(
  providerSource,
  /key=\{\`\$\{getGlobalPlayerSessionKey\(session\)\}:\$\{playbackInstanceId\}\`\}/,
  "engine still remounts on session key / playback instance",
);
assert.match(
  providerSource,
  /createPlayerEngineBridge/,
  "listing UI outside the engine still receives the player",
);
assert.match(
  providerSource,
  /data-playback-scroll="sibling"/,
  "playback media stays beside the listing, not around it",
);
assert.match(
  readFileSync(join(root, "src/lib/pwa/storage.ts"), "utf8"),
  /deviceStateSnapshotKey/,
  "PWA device snapshot stays cached so Play cannot loop the install boundary",
);

const bridge = createPlayerEngineBridge<{ id: string }>();
const seen: Array<string | null> = [];
const unsubscribe = bridge.subscribe(() => {
  seen.push(bridge.getSnapshot()?.id ?? null);
});

const first = bridge.claim();
const second = bridge.claim();
bridge.release(first);
assert.deepEqual(seen, [], "a replaced engine must not clear the listing mid-switch");
bridge.publish({ id: "next" }, second);
assert.equal(bridge.getSnapshot()?.id, "next");
assert.deepEqual(seen, ["next"]);
const again = bridge.getSnapshot();
assert.equal(bridge.getSnapshot(), again, "getSnapshot stays cached until publish");
bridge.release(second);
assert.equal(bridge.getSnapshot(), null);
assert.deepEqual(seen, ["next", null]);
unsubscribe();

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: globalThis,
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
    },
  },
});

const emptyA = readPwaDeviceState();
const emptyB = readPwaDeviceState();
assert.equal(emptyA, emptyB, "empty PWA device state is a stable snapshot");

writePwaDeviceState({
  ...emptyA,
  status: "dismissed",
  dismissedUntil: 10,
});
const storedA = readPwaDeviceState();
const storedB = readPwaDeviceState();
assert.equal(storedA, storedB, "stored PWA device state is a stable snapshot");
assert.notEqual(storedA, emptyA, "a write publishes a new snapshot once");
assert.equal(storedA.status, "dismissed");

console.log("catalog-play-scroll-unit: ok");
