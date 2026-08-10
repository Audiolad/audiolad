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
import {
  isStudioPersistableRecordingMimeType,
  normalizeStudioMimeType,
  selectStudioRecorderMimeType,
} from "../src/lib/studio/recording-mime.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

assert.deepEqual(STUDIO_RECORDER_MIME_TYPES, [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
]);
assert.deepEqual(STUDIO_MICROPHONE_CONSTRAINTS, {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});
assert.equal(getStudioRecordingExtension("audio/webm;codecs=opus"), "webm");
assert.equal(getStudioRecordingExtension("audio/mp4"), "mp4");
assert.equal(
  selectStudioRecorderMimeType((mimeType) =>
    mimeType === "audio/webm;codecs=opus",
  ),
  "audio/webm;codecs=opus",
);
assert.equal(
  selectStudioRecorderMimeType((mimeType) =>
    mimeType === "audio/mp4;codecs=mp4a.40.2",
  ),
  "audio/mp4;codecs=mp4a.40.2",
);
assert.equal(
  selectStudioRecorderMimeType((mimeType) => mimeType === "audio/ogg;codecs=opus"),
  null,
);
assert.equal(selectStudioRecorderMimeType(() => false), null);
assert.equal(normalizeStudioMimeType(" audio/webm;codecs=opus "), "audio/webm");
assert.equal(normalizeStudioMimeType("audio/mp4;codecs=mp4a.40.2"), "audio/mp4");
assert.equal(normalizeStudioMimeType("audio/ogg;codecs=opus"), "audio/ogg");
assert.equal(isStudioPersistableRecordingMimeType("audio/webm;codecs=opus"), true);
assert.equal(isStudioPersistableRecordingMimeType("audio/mp4;codecs=mp4a.40.2"), true);
assert.equal(isStudioPersistableRecordingMimeType("audio/ogg;codecs=opus"), false);
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
assert.match(
  validateStudioRecordedFile({
    name: "Запись 1.ogg",
    type: "audio/ogg;codecs=opus",
    size: 1,
  }),
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
assert.match(hook, /"idle" \| "arming" \| "recording" \| "processing"/);
assert.match(hook, /setRecorderStatus\("arming"\)/);
assert.match(hook, /const requestedMimeType = getStudioRecorderMimeType\(\)/);
assert.match(hook, /new MediaRecorder\(stream, \{ mimeType: requestedMimeType \}\)/);
assert.match(hook, /isStudioPersistableRecordingMimeType\(recorder\.mimeType\)/);
assert.match(hook, /recorder\.stop\(\)/);
assert.match(
  hook,
  /guardStatus !== "recording"[\s\S]*guard-return-status/,
);
assert.match(hook, /!recorder[\s\S]*guard-return-missing-recorder/);
assert.match(hook, /recorder\.state === "inactive"[\s\S]*guard-return-inactive-recorder/);
assert.match(hook, /lastStopAction: "handler-entered"/);
assert.match(hook, /lastStopAction: "recorder-stop-called"[\s\S]*recorder\.stop\(\)/);
assert.match(hook, /recorder\.onstop[\s\S]*lastStopAction: "onstop-fired"/);
assert.match(hook, /recorder\.onerror[\s\S]*lastStopAction: "onerror-fired"/);
assert.match(hook, /activeStreamTrackCount/);
assert.match(hook, /requestedMimeType/);
assert.match(hook, /recorderMimeType/);
assert.match(hook, /blobType/);
assert.match(hook, /normalizedPersistenceMime/);
assert.match(hook, /microphoneRequestCount/);
assert.match(hook, /lastGetUserMediaSuccessAt/);
assert.match(hook, /lastGetUserMediaErrorName/);
assert.match(hook, /stopRecordingInvocationCount/);
assert.match(hook, /recordStopControlEvent/);
assert.match(hook, /track\.readyState === "live"/);
assert.ok(
  hook.indexOf("recorder.start()") < hook.indexOf("setRecordingSlotId(slotId)"),
  "the active slot is exposed only after MediaRecorder.start()",
);
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
assert.match(editor, /recordingSlotId === slot\.id && isRecording/);
assert.match(editor, /Включаем микрофон…/);
assert.match(editor, /Записать с микрофона/);
assert.equal(
  (editor.match(/Стоп · \{formatTime\(recordingElapsed\)\}/g) ?? []).length,
  3,
  "top panel, sidebar, and timeline expose Stop while recording",
);
assert.match(
  editor,
  /\{isRecording \? \(\s*<button[\s\S]*recordStopControlEvent\("top"[\s\S]*stopRecording\(\);/,
  "top recording indicator invokes the shared stop handler",
);
assert.match(
  editor,
  /recordingSlotId === slot\.id && isRecording[\s\S]*recordStopControlEvent\("sidebar"[\s\S]*stopRecording\(\);/,
  "sidebar recording indicator invokes the shared stop handler once",
);
assert.match(
  editor,
  /isThisSlotRecording[\s\S]*recordStopControlEvent\("timeline"[\s\S]*stopRecording\(\);/,
  "timeline recording indicator invokes the shared stop handler",
);
assert.match(editor, /min-h-10 rounded-md px-3 text-rose-200/);
assert.match(editor, /При записи под музыку лучше использовать наушники/);
assert.match(editor, /recorderDebug = false/);
assert.match(editor, /\{recorderDebug \?/);
assert.match(editor, /Отладка записи/);
assert.match(editor, /\{recordingStatus\}/);
assert.match(editor, /\{recordingSlotId \?\? "—"\}/);
assert.match(editor, /debugEnabled: recorderDebug/);
assert.match(
  editor,
  /recordStopControlEvent\("sidebar"[\s\S]*stopRecording\(\);/,
  "sidebar Stop records click evidence before invoking stopRecording",
);
assert.match(editor, /recorderDebugState\.stopClickCount/);
assert.match(editor, /recorderDebugState\.lastStopAction/);
assert.match(editor, /recorderDebugState\.lastStopGuardStatus/);
assert.match(editor, /recorderDebugState\.lastStopMediaRecorderState/);
assert.match(editor, /recorderDebugState\.requestedMimeType/);
assert.match(editor, /recorderDebugState\.microphoneRequestCount/);
assert.match(editor, /recorderDebugState\.topStopPointerDownCount/);
assert.match(editor, /audioDebug = false/);
assert.match(editor, /\{audioDebug \?/);
assert.match(provider, /contextState: context\?\.state/);
assert.match(timeline, /StudioLiveWaveformCanvas/);
assert.match(timeline, /liveRecording\?\.slotId === track\.slotId/);
assert.match(timeline, /track\.clips\.length === 0 \? renderEmpty\(track, index\) : null/);
assert.match(timeline, /className="contents"/);
assert.match(liveWaveform, /requestAnimationFrame\(draw\)/);
assert.match(liveWaveform, /cancelAnimationFrame/);

console.log("studio-recorder-unit: ok");
