#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDIO_MICROPHONE_CONSTRAINTS,
  STUDIO_RECORDER_MIME_TYPES,
  getStudioRecordingExtension,
  shouldFallbackToBasicMicrophoneRequest,
  validateStudioRecordedFile,
} from "../src/lib/studio/recorder.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

assert.deepEqual(STUDIO_RECORDER_MIME_TYPES, [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]);
assert.deepEqual(STUDIO_MICROPHONE_CONSTRAINTS, {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});
assert.equal(getStudioRecordingExtension("audio/webm;codecs=opus"), "webm");
assert.equal(getStudioRecordingExtension("audio/mp4"), "mp4");
assert.equal(getStudioRecordingExtension("audio/ogg;codecs=opus"), "ogg");
assert.equal(
  validateStudioRecordedFile({
    name: "Запись 1.webm",
    type: "audio/webm;codecs=opus",
    size: 1,
  }),
  null,
);
assert.match(
  validateStudioRecordedFile({ name: "Запись 1.wav", type: "audio/wav", size: 1 }),
  /неподдерживаемом/i,
);

const hook = readSource("src/components/studio/useStudioRecorder.ts");
const provider = readSource("src/components/studio/StudioAudioProvider.tsx");
const editor = readSource("src/components/studio/StudioEditorShell.tsx");
const timeline = readSource("src/components/studio/StudioTimeline.tsx");
const liveWaveform = readSource(
  "src/components/studio/StudioLiveWaveformCanvas.tsx",
);
assert.match(
  hook,
  /getUserMedia\(\{\s*audio: STUDIO_MICROPHONE_CONSTRAINTS,\s*\}\)/,
);
assert.match(hook, /getUserMedia\(\{ audio: true \}\)/);
assert.match(hook, /shouldFallbackToBasicMicrophoneRequest/);
assert.equal(
  shouldFallbackToBasicMicrophoneRequest(
    new DOMException("unsupported", "OverconstrainedError"),
  ),
  true,
);
assert.equal(
  shouldFallbackToBasicMicrophoneRequest(
    new DOMException("denied", "NotAllowedError"),
  ),
  false,
);
assert.equal(
  shouldFallbackToBasicMicrophoneRequest(
    new TypeError("unsupported constraints"),
  ),
  true,
);
assert.match(hook, /let activeRecorder: MediaRecorder \| null = null/);
assert.match(hook, /recorder\.stop\(\)/);
assert.match(hook, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
assert.match(hook, /releaseAnalyser\(\)/);
assert.match(hook, /window\.setInterval\(updateElapsed, 250\)/);
assert.doesNotMatch(hook, /AudioContext|createMediaStreamSource/);
assert.match(provider, /ingestRecordedFile/);
assert.match(provider, /startTime: Number\.isFinite\(startTime\)/);
assert.match(provider, /offset: 0/);
assert.match(provider, /fadeInDuration: 0/);
assert.match(provider, /fadeOutDuration: 0/);
assert.match(provider, /createMediaStreamSource\(stream\)/);
assert.match(provider, /source\.connect\(analyser\)/);
assert.doesNotMatch(
  provider.slice(
    provider.indexOf("const createMicrophoneAnalyser"),
    provider.indexOf("const setStatusValue"),
  ),
  /destination/,
);
assert.equal((provider.match(/new AudioContext\(\)/g) ?? []).length, 1);
assert.match(editor, /useStudioRecorder/);
assert.match(editor, /recordingSlotId === slot\.id/);
assert.match(editor, /Записать с микрофона/);
assert.match(editor, /Стоп · \{formatTime\(recordingElapsed\)\}/);
assert.match(editor, /● Идёт запись \{formatTime\(recordingElapsed\)\}/);
assert.match(editor, /При записи под музыку лучше использовать наушники/);
assert.match(timeline, /StudioLiveWaveformCanvas/);
assert.match(timeline, /liveRecording\?\.slotId === track\.id/);
assert.match(liveWaveform, /requestAnimationFrame\(draw\)/);
assert.match(liveWaveform, /cancelAnimationFrame/);

console.log("studio-recorder-unit: ok");
