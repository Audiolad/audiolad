#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  clampStudioAudioPosition,
  getStudioAudioPlaybackPosition,
  getStudioAudioRelativeSeekPosition,
  getStudioProjectDuration,
  getStudioTrackGain,
} from "../src/lib/studio/audio-engine-math.ts";
import { validateStudioLocalFile } from "../src/components/studio/StudioAudioProvider.tsx";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testPositionMath() {
  assert.equal(clampStudioAudioPosition(-5, 30), 0);
  assert.equal(clampStudioAudioPosition(35, 30), 30);
  assert.equal(clampStudioAudioPosition(12.5, 30), 12.5);
  assert.equal(
    getStudioAudioPlaybackPosition({
      startedAtContextTime: 10,
      startedAtPosition: 4,
      contextTime: 17.25,
      duration: 20,
    }),
    11.25,
  );
  assert.equal(
    getStudioAudioPlaybackPosition({
      startedAtContextTime: 10,
      startedAtPosition: 18,
      contextTime: 20,
      duration: 20,
    }),
    20,
  );
  assert.equal(getStudioAudioRelativeSeekPosition(8, -15, 30), 0);
  assert.equal(getStudioAudioRelativeSeekPosition(24, 15, 30), 30);
  assert.equal(getStudioAudioRelativeSeekPosition(10, 15, 30), 25);
  assert.equal(
    getStudioProjectDuration([{ duration: 10 }, { duration: 42 }, { duration: 24 }]),
    42,
  );
  assert.equal(
    getStudioTrackGain({ volume: 0.8, muted: false, solo: false, hasSolo: false }),
    0.8,
  );
  assert.equal(
    getStudioTrackGain({ volume: 0.8, muted: true, solo: true, hasSolo: true }),
    0,
  );
  assert.equal(
    getStudioTrackGain({ volume: 0.8, muted: false, solo: false, hasSolo: true }),
    0,
  );
}

function testLocalFileValidation() {
  assert.equal(
    validateStudioLocalFile({
      name: "voice.mp3",
      type: "audio/mpeg",
      size: 2_000_000,
    }),
    null,
  );
  assert.match(
    validateStudioLocalFile({
      name: "notes.txt",
      type: "text/plain",
      size: 100,
    }),
    /аудиофайл/i,
  );
  assert.match(
    validateStudioLocalFile({
      name: "empty.wav",
      type: "audio/wav",
      size: 0,
    }),
    /пуст/i,
  );
  assert.match(
    validateStudioLocalFile({
      name: "large.mp3",
      type: "audio/mpeg",
      size: 201 * 1024 * 1024,
    }),
    /200 МБ/i,
  );
}

function testProviderEngineLifecycle() {
  const provider = readSource("src/components/studio/StudioAudioProvider.tsx");

  for (const state of [
    '"idle"',
    '"loading"',
    '"ready"',
    '"playing"',
    '"paused"',
    '"error"',
  ]) {
    assert(provider.includes(state), `provider exposes ${state} state`);
  }

  assert.match(provider, /new AudioContext\(\)/);
  assert.match(provider, /decodeAudioData\(await file\.arrayBuffer\(\)\)/);
  assert.match(provider, /context\.createBufferSource\(\)/);
  assert.match(provider, /MAX_LOCAL_TRACKS = 5/);
  assert.match(provider, /MAX_LOCAL_PROJECT_SIZE_BYTES = 750 \* 1024 \* 1024/);
  assert.match(provider, /context\.createGain\(\)/);
  assert.match(provider, /source\.start\(startAt, position\)/);
  assert.match(provider, /trackRuntimesRef/);
  assert.match(provider, /getStudioProjectDuration/);
  assert.match(provider, /getStudioTrackGain/);
  assert.match(provider, /startSourcesAtPosition\(nextPosition\)/);
  assert.match(provider, /MAX_LOCAL_FILE_SIZE_BYTES = 200 \* 1024 \* 1024/);
  assert.match(provider, /SUPPORTED_FILE_EXTENSIONS/);
  assert.match(provider, /gain\.gain\.value = 1/);
  assert.match(provider, /toggleTrackMuted/);
  assert.match(provider, /toggleTrackSolo/);
  assert.match(provider, /removeTrack/);
  assert.match(provider, /cancelProgressLoop\(\)/);
  assert.match(provider, /context\.close\(\)/);
  assert.match(provider, /disposeResources\(\)/);
}

function testStudioBoundariesAndCrossTabStop() {
  const studioLayout = readSource("src/app/(studio)/studio/layout.tsx");
  const studioProvider = readSource("src/components/studio/StudioAudioProvider.tsx");
  const studioWorkspace = readSource(
    "src/components/studio/StudioWorkspace.tsx",
  );
  const globalProvider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );
  const coordination = readSource("src/lib/audio/studio-audio-coordination.ts");

  assert.match(studioLayout, /<StudioAudioProvider>/);
  assert.doesNotMatch(studioLayout, /GlobalAudioPlayerProvider/);
  assert.doesNotMatch(
    studioProvider,
    /requestPlatformAudioStopFromStudio/,
    "opening Studio does not automatically stop audio in other tabs",
  );
  assert.match(studioProvider, /seekRelative/);
  assert.match(
    studioProvider,
    /getStudioAudioRelativeSeekPosition\(\s*getPlaybackPosition\(\),/,
  );
  assert.match(studioProvider, /if \(nextPosition >= projectDurationRef\.current\)/);
  assert.doesNotMatch(studioWorkspace, />\s*Play\s*</);
  assert.match(studioWorkspace, /aria-label="Воспроизвести"/);
  assert.match(studioWorkspace, /aria-label="Пауза"/);
  assert.match(studioWorkspace, /seekRelative\(-15\)/);
  assert.match(studioWorkspace, /seekRelative\(15\)/);
  assert.doesNotMatch(studioWorkspace, /Статус движка/);
  assert.match(studioWorkspace, /multiple/);
  assert.match(studioWorkspace, /tracks\.length >= 5/);
  assert.match(studioWorkspace, /В проект можно добавить не более пяти дорожек/);
  assert.match(studioWorkspace, /toggleTrackMuted/);
  assert.match(studioWorkspace, /toggleTrackSolo/);
  assert.match(studioWorkspace, /currentTime \/ track\.duration/);
  assert.match(coordination, /BroadcastChannel/);
  assert.match(coordination, /STUDIO_AUDIO_STOP_STORAGE_KEY/);
  assert.match(globalProvider, /isStudioAudioStopMessage/);
  assert.match(globalProvider, /stopFromStudio\(\)/);
  assert.match(globalProvider, /hardStop\(\)/);
  assert.match(globalProvider, /channel\?\.close\(\)/);
  assert.match(globalProvider, /removeEventListener\("storage", handleStorage\)/);
}

testPositionMath();
testLocalFileValidation();
testProviderEngineLifecycle();
testStudioBoundariesAndCrossTabStop();

console.log("studio-audio-provider-unit: ok");
