#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDIO_RECORDER_MIME_TYPES,
  getStudioRecordingExtension,
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
assert.match(hook, /getUserMedia\(\{ audio: true \}\)/);
assert.match(hook, /let activeRecorder: MediaRecorder \| null = null/);
assert.match(hook, /recorder\.stop\(\)/);
assert.match(hook, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
assert.doesNotMatch(hook, /createMediaStreamSource|AudioContext/);
assert.match(provider, /ingestRecordedFile/);
assert.match(provider, /startTime: Number\.isFinite\(startTime\)/);
assert.match(provider, /offset: 0/);
assert.match(provider, /fadeInDuration: 0/);
assert.match(provider, /fadeOutDuration: 0/);
assert.match(editor, /useStudioRecorder/);
assert.match(editor, /recordingSlotId === slot\.id/);
assert.match(editor, /Записать с микрофона/);
assert.match(editor, /Стоп · \{formatTime\(recordingElapsed\)\}/);

console.log("studio-recorder-unit: ok");
