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
  getStudioReplacementProjectSize,
  getStudioTrackGain,
} from "../src/lib/studio/audio-engine-math.ts";
import { validateStudioLocalFile } from "../src/lib/studio/local-file-validation.ts";

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
    getStudioProjectDuration([
      { startTime: 0, duration: 10 },
      { startTime: 30, duration: 42 },
      { startTime: 8, duration: 24 },
    ]),
    72,
  );
  assert.equal(
    getStudioProjectDuration([{ duration: 10 }, { duration: 42 }, { duration: 24 }]),
    42,
  );
  assert.equal(
    getStudioTrackGain({ volume: 0.8, muted: false }),
    0.8,
  );
  assert.equal(getStudioTrackGain({ volume: 0.8, muted: true }), 0);
  assert.equal(getStudioReplacementProjectSize(600, 150, 200), 650);
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
    validateStudioLocalFile({ name: "notes.txt", type: "text/plain", size: 100 }),
    /аудиофайл/i,
  );
  assert.match(
    validateStudioLocalFile({ name: "empty.wav", type: "audio/wav", size: 0 }),
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
  const fileValidation = readSource("src/lib/studio/local-file-validation.ts");

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
  assert.match(provider, /for \(const clip of track\.clips\)/);
  assert.match(provider, /clip\.startTime \+ clip\.duration/);
  assert.match(provider, /clip\.offset \+ elapsedClipTime/);
  assert.match(provider, /source\.start\(/);
  assert.match(provider, /trackRuntimesRef/);
  assert.match(provider, /getStudioProjectDurationFromClips/);
  assert.match(provider, /setClipLayout/);
  assert.match(provider, /getStudioClipLayout/);
  assert.match(provider, /getStudioTrackGain/);
  assert.match(provider, /startSourcesAtPosition\(nextPosition\)/);
  assert.match(fileValidation, /MAX_LOCAL_FILE_SIZE_BYTES = 200 \* 1024 \* 1024/);
  assert.match(fileValidation, /SUPPORTED_FILE_EXTENSIONS/);
  assert.match(provider, /local-file-validation/);
  assert.match(provider, /export \{ validateStudioLocalFile \}/);
  assert.match(provider, /outputGain\.gain\.value = 1/);
  assert.match(provider, /toggleTrackMuted/);
  assert.match(provider, /getTrackBuffer/);
  assert.match(
    provider,
    /trackRuntimesRef\.current\.get\(trackId\)\?\.buffer \?\? null/,
  );
  assert.match(provider, /replaceTrackAudio/);
  assert.match(provider, /ingestRecordedFile/);
  assert.match(provider, /validateStudioRecordedFile/);
  assert.match(provider, /clips: \[\{/);
  assert.match(provider, /startTime: Number\.isFinite\(startTime\)/);
  assert.match(provider, /offset: 0/);
  assert.match(provider, /fadeInDuration: 0/);
  assert.match(provider, /fadeOutDuration: 0/);
  assert.match(provider, /getStudioReplacementProjectSize/);
  assert.match(provider, /sources: Map<string/);
  assert.match(provider, /envelopeGain/);
  assert.match(provider, /splitClip/);
  assert.match(provider, /removeClip/);
  assert.doesNotMatch(provider, /\bsolo\b/i);
  assert.match(provider, /removeTrack/);
  assert.match(provider, /assetVaultRef/);
  assert.match(provider, /exportEditingState/);
  assert.match(provider, /restoreEditingState/);
  assert.match(provider, /restoreTracks/);
  assert.match(provider, /pruneRetainedAssets/);
  assert.match(provider, /updateRetainedAssets/);
  assert.match(provider, /pasteClips/);
  assert.match(provider, /createTrackRuntime/);
  assert.match(provider, /stopSources\(\);[\s\S]*trackRuntimesRef\.current\.clear\(\)/);
  assert.match(provider, /position: getPlaybackPosition\(\)/);
  assert.doesNotMatch(
    readSource("src/lib/studio/history.ts"),
    /\b(?:AudioBuffer|AudioBufferSourceNode|GainNode|File|Blob)\b/,
    "history snapshots cannot retain browser audio assets or nodes",
  );
  assert.match(provider, /cancelProgressLoop\(\)/);
  assert.match(provider, /context\.close\(\)/);
  assert.match(provider, /disposeResources\(\)/);
}

function testStudioBoundariesAndCrossTabStop() {
  const editorLayout = readSource(
    "src/app/(studio)/studio/project/new/layout.tsx",
  );
  const studioProvider = readSource("src/components/studio/StudioAudioProvider.tsx");
  const studioWorkspace = readSource(
    "src/components/studio/StudioEditorShell.tsx",
  );
  const globalStyles = readSource("src/app/globals.css");
  const globalProvider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );
  const coordination = readSource("src/lib/audio/studio-audio-coordination.ts");

  assert.match(editorLayout, /<StudioAudioProvider>/);
  assert.doesNotMatch(editorLayout, /GlobalAudioPlayerProvider/);
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
  const fixedPlayPauseGeometry =
    /inline-flex h-10 w-10 items-center justify-center rounded-lg bg-\[#4fb887\] p-0 leading-none text-\[#06110d\]/g;
  assert.equal(
    [...studioWorkspace.matchAll(fixedPlayPauseGeometry)].length,
    2,
    "Play and Pause use the same fixed square control geometry",
  );
  assert.doesNotMatch(
    studioWorkspace,
    /aria-label="(?:Пауза|Воспроизвести)"[\s\S]{0,240}(?:scale|transform)/,
    "Play/Pause controls do not use geometry-changing visual effects",
  );
  assert.match(studioWorkspace, /handleStudioShortcut/);
  assert.match(studioWorkspace, /event\.key === " "/);
  assert.match(studioWorkspace, /event\.repeat/);
  assert.match(studioWorkspace, /event\.ctrlKey/);
  assert.match(studioWorkspace, /event\.metaKey/);
  assert.match(studioWorkspace, /event\.altKey/);
  assert.match(studioWorkspace, /event\.isComposing/);
  assert.match(studioWorkspace, /canControlTransport/);
  assert.match(studioWorkspace, /isNativeInteractiveTarget\(event\.target\)/);
  assert.match(
    studioWorkspace,
    /input, textarea, select, button, \[contenteditable="true"\]/,
  );
  assert.match(studioWorkspace, /event\.preventDefault\(\);/);
  assert.match(studioWorkspace, /if \(isPlaying\) \{\s*pause\(\);\s*\} else \{\s*void play\(\);/);
  assert.match(
    studioWorkspace,
    /title="Пробел — воспроизведение \/ пауза"/,
  );
  assert.match(studioWorkspace, /seekRelative\(-15\)/);
  assert.match(studioWorkspace, /seekRelative\(15\)/);
  assert.match(
    studioWorkspace,
    /timelineRef\.current\?\.scrollToStart\(\)/,
  );
  assert.match(studioWorkspace, /timelineRef\.current\?\.scrollToEnd\(\)/);
  assert.match(studioWorkspace, /seek\(0\);[\s\S]*scrollToStart\(\)/);
  assert.match(
    studioWorkspace,
    /seek\(projectDuration\);[\s\S]*scrollToEnd\(\)/,
  );
  assert.match(studioWorkspace, /useRef<StudioTimelineHandle \| null>\(null\)/);
  assert.match(studioWorkspace, /ref=\{timelineRef\}/);
  assert.match(studioWorkspace, /aria-label="Перейти в конец"/);
  assert.match(studioWorkspace, /title="Перейти в конец проекта"/);
  assert.match(
    studioWorkspace,
    /disabled=\{!canControlTransport\}[\s\S]*scrollToEnd\(\)/,
  );
  assert.match(
    studioWorkspace,
    /scrollToEnd\(\);[\s\S]*className="h-10 rounded-lg border border-white\/15 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"/,
  );
  assert.doesNotMatch(studioWorkspace, /Статус движка/);
  assert.match(studioWorkspace, /MAX_TRACK_SLOTS = 5/);
  assert.match(studioWorkspace, /Дорожка 1/);
  assert.match(studioWorkspace, /Дорожка 2/);
  assert.match(studioWorkspace, /slots\.length < MAX_TRACK_SLOTS/);
  assert.match(studioWorkspace, /\+ Добавить дорожку/);
  assert.match(studioWorkspace, /disabled=\{!track\}/);
  assert.match(
    studioWorkspace,
    /Добавьте аудио, чтобы регулировать громкость/,
  );
  assert.match(
    studioWorkspace,
    /Добавьте аудио, чтобы управлять звуком/,
  );
  assert.match(studioWorkspace, /В проект можно добавить не более пяти дорожек/);
  assert.match(studioWorkspace, /toggleTrackMuted/);
  assert.match(studioWorkspace, /Заменить аудио/);
  assert.match(studioWorkspace, /Очистить дорожку/);
  assert.match(studioWorkspace, /index >= 2/);
  assert.match(studioWorkspace, /saveSlotRename/);
  assert.match(studioWorkspace, /event\.key === "Escape"/);
  assert.doesNotMatch(studioWorkspace, /Пустая универсальная дорожка/);
  assert.match(studioWorkspace, /Включить звук дорожки/);
  assert.match(studioWorkspace, /Отключить звук дорожки/);
  assert.doesNotMatch(studioWorkspace, />\s*[MS]\s*</);
  assert.doesNotMatch(studioWorkspace, /\bSolo\b/i);
  assert.match(studioWorkspace, /href="\/studio"/);
  assert.match(studioWorkspace, /Назад в Studio/);
  assert.match(studioWorkspace, /studio-volume-fader flex h-28 w-5 shrink-0/);
  assert.match(studioWorkspace, /studio-volume-fader__range/);
  assert.doesNotMatch(studioWorkspace, /transform:\s*["'`]?rotate/);
  assert.doesNotMatch(studioWorkspace, /style=\{\{[^}]*volume/);
  assert.match(
    globalStyles,
    /\.studio-volume-fader \{[\s\S]*flex: 0 0 1\.25rem;[\s\S]*min-width: 1\.25rem;[\s\S]*max-width: 1\.25rem;/,
  );
  assert.match(
    globalStyles,
    /\.studio-volume-fader__range \{[\s\S]*box-sizing: border-box;[\s\S]*-webkit-appearance: slider-vertical;[\s\S]*writing-mode: vertical-lr;/,
  );
  assert.match(
    globalStyles,
    /::-webkit-slider-runnable-track,[\s\S]*::-webkit-slider-thumb \{[\s\S]*box-sizing: border-box;/,
  );
  assert.match(studioWorkspace, /StudioTimeline,/);
  assert.match(studioWorkspace, /<StudioTimeline/);
  assert.match(studioWorkspace, /getTrackBuffer\(track\.id\)/);
  assert.match(
    studioWorkspace,
    /hasAudio: Boolean\(slot\.audioTrackId && track\?\.clips\.length\)/,
  );
  assert.match(
    studioWorkspace,
    /\{ id: "slot-1", name: "Дорожка 1", audioTrackId: null \},[\s\S]*\{ id: "slot-2", name: "Дорожка 2", audioTrackId: null \}/,
  );
  assert.match(
    studioWorkspace,
    /name: `Дорожка \$\{nextNumber\}`,[\s\S]*audioTrackId: null/,
  );
  assert.match(
    studioWorkspace,
    /item\.id === slot\.id[\s\S]*audioTrackId: null/,
  );
  assert.match(studioWorkspace, /renderControls=\{renderTimelineControls\}/);
  assert.match(studioWorkspace, /renderEmpty=\{renderTimelineEmptyState\}/);
  assert.match(studioWorkspace, /useStudioRecorder/);
  assert.match(studioWorkspace, /recordingSlotId === slot\.id/);
  assert.match(studioWorkspace, /Записать с микрофона/);
  assert.match(studioWorkspace, /Записать/);
  assert.match(studioWorkspace, /Стоп · \{formatTime\(recordingElapsed\)\}/);
  assert.match(studioWorkspace, /onPointerUp=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(studioWorkspace, /<p className="truncate text-sm font-semibold text-white">\s*\{projectName\}/);
  assert.doesNotMatch(studioWorkspace, /Проект: \{projectName\}/);
  assert.match(studioWorkspace, /Сохранение проектов будет добавлено/);
  assert.match(studioWorkspace, /Экспорт будет доступен после подключения серверного сведения/);
  assert.doesNotMatch(studioWorkspace, /Мастер-(дорожка|трек)/);
  const timeline = readSource("src/components/studio/StudioTimeline.tsx");
  const waveformCanvas = readSource(
    "src/components/studio/StudioWaveformCanvas.tsx",
  );
  assert.match(timeline, /pixelsPerSecond/);
  assert.match(timeline, /forwardRef<StudioTimelineHandle, StudioTimelineProps>/);
  assert.match(timeline, /useImperativeHandle/);
  assert.match(timeline, /scrollToStart: \(\) => scrollTo\(0\)/);
  assert.match(timeline, /scrollWidth - viewport\.clientWidth/);
  assert.match(timeline, /lastManualScrollAtRef\.current = Date\.now\(\)/);
  assert.doesNotMatch(timeline, /querySelector/);
  assert.match(timeline, /overflow-x-auto/);
  assert.match(timeline, /WAVEFORM_OVERSCAN_PIXELS/);
  assert.match(timeline, /renderStartX/);
  assert.match(timeline, /onScroll/);
  assert.match(timeline, /grid-cols-\[250px_minmax\(0,1fr\)\]/);
  assert.match(timeline, /renderControls\(track, index\)/);
  assert.match(timeline, /hasAudio: boolean/);
  assert.match(timeline, /track\.clips\.length === 0 \? renderEmpty\(track, index\) : null/);
  assert.doesNotMatch(timeline, /!track\.buffer \? renderEmpty/);
  assert.match(timeline, /clipWidth/);
  assert.match(timeline, /clipLeft/);
  assert.match(timeline, /trim-start/);
  assert.match(timeline, /trim-end/);
  assert.match(timeline, /getStudioClipMoveLayout/);
  assert.match(timeline, /onClipLayoutChange/);
  assert.match(timeline, /selectedClipId/);
  assert.match(timeline, /track\.clips\.map/);
  assert.match(timeline, /onPointerUp=\{seekFromPointer\}/);
  const beginGesture = timeline.slice(
    timeline.indexOf("const beginClipGesture"),
    timeline.indexOf("const previewClipGesture"),
  );
  assert.match(beginGesture, /onSelectClip\(clip\.id\)/);
  assert.ok(
    beginGesture.indexOf("onSelectClip(clip.id)") <
      beginGesture.indexOf("event.stopPropagation()"),
    "clip selection must happen before the gesture stops propagation",
  );
  assert.match(studioWorkspace, /clip=\{selectedClip\}/);
  assert.match(studioWorkspace, /disabled=\{!selectedClip\}/);
  assert.match(studioWorkspace, /disabled=\{!canSplitSelectedClip\}/);
  assert.match(studioWorkspace, /currentTime > selectedClip\.startTime \+ MIN_STUDIO_CLIP_DURATION/);
  assert.match(
    studioWorkspace,
    /currentTime <\s*selectedClip\.startTime \+\s*selectedClip\.duration -\s*MIN_STUDIO_CLIP_DURATION/,
  );
  assert.match(
    timeline,
    /aria-label=\{`Автоматизация затуханий \$\{track\.name\}`\}[\s\S]*className="relative h-9 border-t/,
  );
  assert.doesNotMatch(timeline, /absolute top-\[88px\]/);
  assert.match(timeline, /selectedClipId === clip\.id/);
  assert.match(
    timeline,
    /clip\.fadeInDuration > 0 \|\| clip\.fadeOutDuration > 0/,
  );
  assert.match(
    timeline,
    /clip\.fadeInDuration <= 0 && clip\.fadeOutDuration <= 0/,
  );
  assert.doesNotMatch(timeline, /track\.fade(?:In|Out)Duration/);
  assert.match(timeline, /lastManualScrollAtRef/);
  assert.match(timeline, /getAnchoredTimelineScrollLeft/);
  assert.match(timeline, /onSeek=\{\(clipX\)/);
  assert.doesNotMatch(timeline, /onToggleMuted|onVolumeChange/);
  assert.doesNotMatch(timeline, /wavesurfer|<audio(?:\s|>)/i);
  assert.match(waveformCanvas, /getCachedWaveformPeaks/);
  assert.match(waveformCanvas, /sourceOffset/);
  assert.match(waveformCanvas, /sourceDuration/);
  assert.match(waveformCanvas, /viewportWidth/);
  assert.match(waveformCanvas, /renderStartX/);
  assert.doesNotMatch(waveformCanvas, /width=\{timelineWidth\}/);
  assert.doesNotMatch(waveformCanvas, /wavesurfer|<audio(?:\s|>)/i);
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
