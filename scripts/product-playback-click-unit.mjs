#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProductPlaybackClickAction } from "../src/lib/products/product-playback-click.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.deepEqual(
  resolveProductPlaybackClickAction({
    enabled: false,
    isSameProduct: true,
    trackIndex: 0,
    currentTrackId: "a",
    clickedTrackId: "a",
  }),
  { type: "noop" },
);

assert.deepEqual(
  resolveProductPlaybackClickAction({
    enabled: true,
    isSameProduct: false,
    trackIndex: -1,
    currentTrackId: null,
    clickedTrackId: "a",
  }),
  { type: "load_session" },
);

assert.deepEqual(
  resolveProductPlaybackClickAction({
    enabled: true,
    isSameProduct: true,
    trackIndex: 0,
    currentTrackId: "a",
    clickedTrackId: "a",
  }),
  { type: "toggle_pause_resume" },
);

assert.deepEqual(
  resolveProductPlaybackClickAction({
    enabled: true,
    isSameProduct: true,
    trackIndex: 1,
    currentTrackId: "a",
    clickedTrackId: "b",
  }),
  { type: "play_at_index", index: 1 },
);

const playbackHook = readFileSync(
  path.join(root, "src/components/products/useProductContentsPlayback.ts"),
  "utf8",
);
assert.match(playbackHook, /resolveProductPlaybackClickAction/);
assert.match(playbackHook, /handlePlayPause/);
assert.match(playbackHook, /isPlaying/);
assert.match(playbackHook, /sessionCacheRef/);
assert.match(playbackHook, /needsGesturePlay/);
assert.match(playbackHook, /isProductAutoplayBlockedHint/);
assert.match(playbackHook, /prefetch/);

const audioPostPlayer = readFileSync(
  path.join(root, "src/components/products/audio-post/AudioPostPlayer.tsx"),
  "utf8",
);
assert.match(audioPostPlayer, /showAsPlaying/);
assert.match(audioPostPlayer, /needsGesturePlay/);
assert.match(audioPostPlayer, /"Пауза"/);
assert.match(audioPostPlayer, /PLAY_ACTION_LABEL/);
assert.doesNotMatch(audioPostPlayer, /Воспроизвести/);
assert.doesNotMatch(audioPostPlayer, /Слушаю/);
assert.match(audioPostPlayer, /isPlaying/);
assert.match(audioPostPlayer, /role="alert"/);
assert.doesNotMatch(audioPostPlayer, /setTimeout/);
assert.doesNotMatch(audioPostPlayer, /Воспроизведение откроется в плеере/);
assert.match(audioPostPlayer, /variant/);

console.log("product-playback-click-unit: ok");
