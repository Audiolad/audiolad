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
  assert.equal(getStudioTrackGain({ volume: 0, muted: false }), 0);
  assert.equal(getStudioTrackGain({ volume: 1, muted: false }), 1);
  assert.equal(getStudioTrackGain({ volume: 2, muted: false }), 2);
  assert.equal(getStudioTrackGain({ volume: 4, muted: false }), 4);
  assert.equal(getStudioTrackGain({ volume: 5, muted: false }), 4);
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
  assert.match(provider, /fxInput\.connect\(outputGain\)/);
  assert.match(provider, /setTrackVoicePreset/);
  assert.match(provider, /STUDIO_VOICE_PRESET_CONFIG/);
  assert.match(provider, /lowShelf: \{ frequency: 200, gain: 3 \}/);
  assert.match(provider, /lowShelf: \{ frequency: 135, gain: 4 \}/);
  assert.match(provider, /lowMid: \{ frequency: 300, gain: 2 \}/);
  assert.match(provider, /delaySeconds: 0\.14/);
  assert.match(provider, /wetGain: 0\.22/);
  assert.match(provider, /feedbackGain: 0\.14/);
  assert.match(provider, /wetHighShelf/);
  assert.match(provider, /track\.trackKind !== "voice"/);
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
  assert.match(provider, /rippleDeleteClip/);
  assert.match(provider, /getStudioRippleDeleteResult/);
  assert.match(
    provider,
    /position >= removedEnd[\s\S]*position - result\.removedClip\.duration/,
  );
  assert.match(
    provider,
    /position > result\.removedClip\.startTime[\s\S]*result\.removedClip\.startTime/,
  );
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

  assert.match(studioWorkspace, /max=\{trackKind === "voice" \? "400" : "200"\}/);
  assert.match(studioWorkspace, /Высокое усиление может вызвать искажения/);
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
  assert.match(studioWorkspace, /MAX_VOICE_TRACKS = 3/);
  assert.match(studioWorkspace, /MAX_MUSIC_TRACKS = 2/);
  assert.match(studioWorkspace, /Голос 1/);
  assert.match(studioWorkspace, /Музыка 1/);
  assert.match(studioWorkspace, /"Голос" : "Музыка"/);
  assert.match(studioWorkspace, /trackKind === "voice"/);
  assert.match(studioWorkspace, /currentSlots\.slice\(0, insertAt\)/);
  assert.match(studioWorkspace, /\+ Голос/);
  assert.match(studioWorkspace, /\+ Музыка/);
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
  assert.match(studioWorkspace, /max=\{trackKind === "voice" \? "400" : "200"\}/);
  assert.match(studioWorkspace, /setTrackVolume\(track\.id, Number\(event\.target\.value\) \/ 100\)/);
  assert.doesNotMatch(studioWorkspace, /transform:\s*["'`]?rotate/);
  assert.doesNotMatch(studioWorkspace, /style=\{\{[^}]*volume/);
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
    /slot-voice-1[\s\S]*Голос 1[\s\S]*slot-music-1[\s\S]*Музыка 1/,
  );
  assert.match(
    studioWorkspace,
    /name: `\$\{trackKind === "voice" \? "Голос" : "Музыка"\} \$\{nextNumber\}`,[\s\S]*audioTrackId: null,[\s\S]*trackKind/,
  );
  assert.match(
    studioWorkspace,
    /item\.id === slot\.id[\s\S]*audioTrackId: null/,
  );
  assert.match(studioWorkspace, /renderControls=\{renderTimelineControls\}/);
  assert.match(studioWorkspace, /renderEmpty=\{renderTimelineEmptyState\}/);
  assert.match(studioWorkspace, /useStudioRecorder/);
  assert.match(studioWorkspace, /recordingSlotId === slot\.id/);
  assert.match(studioWorkspace, /Записать голос/);
  assert.match(studioWorkspace, /Загрузить голос/);
  assert.match(studioWorkspace, /Добавить музыку/);
  assert.match(studioWorkspace, /Записать/);
  assert.match(studioWorkspace, /Стоп · \{formatTime\(recordingElapsed\)\}/);
  assert.match(studioWorkspace, /onPointerUp=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(studioWorkspace, /<p className="truncate text-sm font-semibold text-white">\s*\{projectName\}/);
  assert.doesNotMatch(studioWorkspace, /Проект: \{projectName\}/);
  assert.match(studioWorkspace, /Сохранить/);
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
  assert.match(timeline, /timeToTimelineX\(projectExtent, pixelsPerSecond\)/);
  assert.match(timeline, /clampTimelineScrollLeft/);
  assert.match(
    timeline,
    /timeToTimelineX\(projectExtent, pixelsPerSecond\) -\s*viewport\.clientWidth \* 0\.75/,
  );
  assert.match(timeline, /lastManualScrollAtRef\.current = Date\.now\(\)/);
  assert.doesNotMatch(timeline, /querySelector/);
  assert.match(timeline, /overflow-x-auto/);
  assert.match(timeline, /WAVEFORM_OVERSCAN_PIXELS/);
  assert.match(timeline, /renderStartX/);
  assert.match(timeline, /onScroll/);
  assert.match(timeline, /grid-cols-\[250px_minmax\(0,1fr\)\]/);
  assert.match(
    timeline,
    /gridTemplateColumns: `250px \$\{timelineWidth\}px`/,
  );
  assert.match(timeline, /className="contents"/);
  assert.match(timeline, /sticky left-0 z-20 min-h-\[190px\]/);
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
  assert.match(timeline, /getTimelineEditExtent/);
  assert.match(timeline, /const editHorizon = getTimelineEditExtent/);
  assert.match(timeline, /timelineXToTime\(offsetX, pixelsPerSecond\), editHorizon/);
  assert.match(timeline, /timeToTimelineX\(projectExtent, pixelsPerSecond\)/);
  assert.match(timeline, /onSelectClip\(null\)/);
  assert.match(timeline, /const isSelected = selectedClipId === clip\.id/);
  assert.match(timeline, /border-violet-200 bg-violet-300\/15/);
  assert.match(timeline, /border-white\/30 bg-white\/5/);
  assert.match(timeline, /aria-selected=\{isSelected\}/);
  assert.match(
    timeline,
    /closest\("\[data-studio-clip\], \[data-studio-fade-lane\]"\)/,
  );
  assert.match(
    studioWorkspace,
    /track\.id === clipboard\.sourceTrackId/,
  );
  assert.match(
    studioWorkspace,
    /pasteClips\(targetTrack\.id, clipboard, currentTime\)/,
  );
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
  assert.match(
    studioWorkspace,
    /currentTime >\s*selectedTrackAndClip\.clip\.startTime \+\s*MIN_STUDIO_CLIP_DURATION/,
  );
  assert.match(
    studioWorkspace,
    /currentTime <\s*selectedTrackAndClip\.clip\.startTime \+\s*selectedTrackAndClip\.clip\.duration -\s*MIN_STUDIO_CLIP_DURATION/,
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
