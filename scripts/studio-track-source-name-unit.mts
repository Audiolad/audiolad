import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getStudioTrackNameFromSourceDisplayName,
  isStudioDefaultTrackName,
} from "../src/lib/studio/track-source-name";

assert.equal(getStudioTrackNameFromSourceDisplayName("Meditation Deep Relax.mp3"), "Meditation Deep Relax");
assert.equal(getStudioTrackNameFromSourceDisplayName(" rain_soft_01.wav "), "rain_soft_01");
assert.equal(getStudioTrackNameFromSourceDisplayName("archive.mix.m4a"), "archive.mix");
assert.equal(getStudioTrackNameFromSourceDisplayName(".recording"), ".recording");
assert.equal(isStudioDefaultTrackName("Голос 2", "voice"), true);
assert.equal(isStudioDefaultTrackName("Музыка 2", "music"), true);
assert.equal(isStudioDefaultTrackName("Основная музыка", "music"), false);

const shell = await readFile(
  new URL("../src/components/studio/StudioEditorShell.tsx", import.meta.url),
  "utf8",
);
assert.match(shell, /getStudioTrackNameFromSourceDisplayName\(file\.name\)/);
assert.match(shell, /isStudioDefaultTrackName/);
assert.match(shell, /replaceTrackAudio\(trackId, file\)\.then/);
assert.match(shell, /onRecordedFile: async \(file, startTime, slotId\)/);

console.log("studio-track-source-name-unit: ok");
