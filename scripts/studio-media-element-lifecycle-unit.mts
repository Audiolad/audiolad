import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getStudioClipLayout } from "../src/lib/studio/clip-math";
import {
  beginStudioCatalogPreviewPlay,
  beginStudioMediaPlayback,
  cancelStudioMediaPlayback,
  runStudioAudibleStartupBarrier,
  describeStudioAudioElement,
  formatStudioPauseAudioDiagnostics,
  isStudioMediaStartBlocked,
  publishStudioPauseDiagnostics,
  readStudioMediaPlayOutcomes,
  readStudioPauseDiagnostics,
  seekStudioMediaElementIfNeeded,
  stopStudioCatalogPreview,
  STUDIO_MEDIA_PLAY_FAILED_MESSAGE,
} from "../src/lib/studio/media-element-lifecycle";
import {
  getStudioClipMediaTime,
  listStudioTracksAudibleAtPlayhead,
  planStudioMediaElementSync,
  planStudioProviderPlayRestart,
  shouldCorrectStudioMediaDrift,
} from "../src/lib/studio/media-element-sync";

type FakeOptions = {
  rejectPlayWhileSeeking: boolean;
  resumeOnResolve: boolean;
  resumeOnSeeked: boolean;
  autoSeek: boolean;
  holdPlay: boolean;
  rejectPlayWith: string | null;
  scheduleSeek: ((emit: () => void) => void) | null;
};

type PlayHold = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

function createFakeMedia(partial: Partial<FakeOptions> = {}) {
  const options: FakeOptions = {
    rejectPlayWhileSeeking: true,
    resumeOnResolve: true,
    resumeOnSeeked: true,
    autoSeek: true,
    holdPlay: false,
    rejectPlayWith: null,
    scheduleSeek: null,
    ...partial,
  };
  const listeners = new Map<string, Set<() => void>>();
  let currentTime = 0;
  let seeking = false;
  let pendingSeek: number | null = null;
  let seekSerial = 0;
  let paused = true;
  let readyState = 1;
  let playArmed = false;
  let pendingPlay: PlayHold | null = null;
  let srcRemoved = false;
  const media = {
    src: "https://audiolad.ru/storage/v1/object/sign/studio/track.mp3?token=secret",
    ended: false,
    networkState: 2,
    loop: false,
    playCalls: 0,
    playSeekingAtCall: [] as boolean[],
    pauseCalls: 0,
    loadCalls: 0,
    seekAssignments: 0,
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      if (readyState < 1) {
        throw new DOMException(
          "The media element has not loaded metadata.",
          "InvalidStateError",
        );
      }
      if (!seeking && Math.abs(value - currentTime) <= 1e-4) {
        return;
      }
      const serial = ++seekSerial;
      media.seekAssignments += 1;
      pendingSeek = value;
      seeking = true;
      const emitIfCurrent = () => {
        if (serial !== seekSerial) return;
        emitSeeked();
      };
      if (options.scheduleSeek) {
        options.scheduleSeek(emitIfCurrent);
      } else if (options.autoSeek) {
        queueMicrotask(emitIfCurrent);
      }
    },
    get paused() {
      return paused;
    },
    get seeking() {
      return seeking;
    },
    get readyState() {
      return readyState;
    },
    set readyState(value: number) {
      readyState = value;
    },
    play() {
      media.playCalls += 1;
      media.playSeekingAtCall.push(seeking);
      playArmed = true;
      if (options.rejectPlayWith) {
        return Promise.reject(
          new DOMException("play rejected", options.rejectPlayWith),
        );
      }
      if (seeking && options.rejectPlayWhileSeeking) {
        return Promise.reject(
          new DOMException(
            "The play() request was interrupted by a seek.",
            "AbortError",
          ),
        );
      }
      paused = false;
      if (options.holdPlay) {
        return new Promise<void>((resolve, reject) => {
          pendingPlay = {
            resolve: () => {
              if (options.resumeOnResolve) paused = false;
              pendingPlay = null;
              resolve();
            },
            reject,
          };
        });
      }
      return Promise.resolve().then(() => {
        if (options.resumeOnResolve) paused = false;
      });
    },
    pause() {
      media.pauseCalls += 1;
      paused = true;
    },
    load() {
      media.loadCalls += 1;
      paused = true;
      seeking = false;
      pendingSeek = null;
    },
    removeAttribute(name: string) {
      if (name === "src") {
        srcRemoved = true;
        media.src = "";
      }
    },
    addEventListener(type: string, listener: () => void) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    emitSeeked() {
      emitSeeked();
    },
    emitLoadedMetadata() {
      readyState = Math.max(readyState, 1);
      dispatch("loadedmetadata");
    },
    resolvePlay() {
      pendingPlay?.resolve();
    },
    get srcRemoved() {
      return srcRemoved;
    },
  };

  function dispatch(type: string) {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener();
    }
  }

  function emitSeeked() {
    if (pendingSeek != null) currentTime = pendingSeek;
    pendingSeek = null;
    seeking = false;
    if (options.resumeOnSeeked && playArmed) {
      paused = false;
    }
    dispatch("seeked");
  }

  return media;
}

function generationGate() {
  let generation = 0;
  return {
    bump() {
      generation += 1;
      return generation;
    },
    get current() {
      return generation;
    },
    isCurrent(expected: number) {
      return expected === generation;
    },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function drain() {
  for (let step = 0; step < 12; step += 1) {
    await Promise.resolve();
  }
}

function createVirtualClock(onNow?: (now: number) => void) {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void }> = [];
  return {
    get now() {
      return now;
    },
    after(delayMs: number, fn: () => void) {
      timers.push({ at: now + delayMs, fn });
    },
    async advance(ms: number) {
      const target = now + ms;
      await drain();
      while (true) {
        let nextIndex = -1;
        for (let index = 0; index < timers.length; index += 1) {
          const timer = timers[index];
          if (!timer || timer.at > target) continue;
          if (
            nextIndex < 0 ||
            timer.at < (timers[nextIndex]?.at ?? Number.POSITIVE_INFINITY)
          ) {
            nextIndex = index;
          }
        }
        if (nextIndex < 0) break;
        const next = timers[nextIndex];
        timers.splice(nextIndex, 1);
        if (!next) break;
        now = next.at;
        onNow?.(now);
        next.fn();
        await drain();
      }
      now = target;
      onNow?.(now);
      await drain();
    },
  };
}

async function startAt(
  media: ReturnType<typeof createFakeMedia>,
  gate: ReturnType<typeof generationGate>,
  target: number | null,
  generation = gate.current,
) {
  return beginStudioMediaPlayback({
    media,
    generation,
    isGenerationCurrent: (value) => gate.isCurrent(value),
    targetTime: target,
  });
}

function testSeekRestartIsTheSilenceMechanism() {
  const naive = createFakeMedia({ autoSeek: false, resumeOnSeeked: false });
  naive.readyState = 1;
  naive.currentTime = 0;
  for (let frame = 0; frame < 5; frame += 1) {
    naive.currentTime = 30;
  }
  assert.equal(naive.seekAssignments, 5);
  assert.equal(naive.seeking, true);
  assert.equal(naive.currentTime, 0);

  const guarded = createFakeMedia({ autoSeek: false, resumeOnSeeked: false });
  guarded.readyState = 1;
  const first = seekStudioMediaElementIfNeeded(guarded, 30);
  assert.equal(first, "in-flight");
  assert.equal(guarded.seekAssignments, 1);
  assert.equal(seekStudioMediaElementIfNeeded(guarded, 30), "in-flight");
  assert.equal(seekStudioMediaElementIfNeeded(guarded, 30), "in-flight");
  assert.equal(guarded.seekAssignments, 1);
  assert.equal(guarded.currentTime, 0);
  guarded.emitSeeked();
  assert.equal(guarded.seeking, false);
  assert.equal(guarded.currentTime, 30);

  const atZero = createFakeMedia({ autoSeek: true });
  atZero.currentTime = 0;
  assert.equal(seekStudioMediaElementIfNeeded(atZero, 0), "settled");
  assert.equal(atZero.seekAssignments, 0);
  assert.equal(atZero.seeking, false);
}

async function testCatalogMusicMidClipAfterPause() {
  const gate = generationGate();
  const media = createFakeMedia();
  media.readyState = 1;
  const clip = { id: "music", startTime: 0, offset: 0, duration: 120 };

  let generation = gate.bump();
  const fromStart = await startAt(media, gate, getStudioClipMediaTime(clip, 0), generation);
  assert.equal(fromStart.started, true);
  assert.equal(fromStart.playCalled, true);
  assert.equal(fromStart.playSettled, "resolved");
  assert.equal(media.paused, false);
  assert.equal(media.currentTime, 0);
  assert.equal(media.seekAssignments, 0);

  generation = gate.bump();
  cancelStudioMediaPlayback(media);
  media.pause();
  await flush();
  assert.equal(media.paused, true);

  const middle = 40;
  const parked = planStudioMediaElementSync({
    clips: [clip],
    timelineTime: middle,
    playing: false,
    activeClipId: null,
    mediaCurrentTime: media.currentTime,
  });
  assert.equal(parked.wantPlaying, false);
  assert.equal(parked.activeClipId, null);
  assert.equal(parked.envelope, "silence");
  assert.equal(parked.seekTo, middle);
  seekStudioMediaElementIfNeeded(media, parked.seekTo ?? middle);
  await flush();
  assert.equal(media.currentTime, middle);
  assert.equal(media.paused, true);

  generation = gate.bump();
  const restart = planStudioProviderPlayRestart({
    clips: [clip],
    timelineTime: middle,
    staleActiveClipId: "music",
    mediaCurrentTime: media.currentTime,
  });
  const played = await startAt(media, gate, restart.seekTo, generation);
  assert.equal(played.started, true);
  assert.equal(played.stale, false);
  assert.equal(played.errorName, null);
  assert.equal(media.paused, false);
  assert.equal(media.currentTime, middle);
  assert.equal(media.seeking, false);
}

async function testVoiceSameMidClipPath() {
  const gate = generationGate();
  const media = createFakeMedia();
  const clip = { id: "voice-a", startTime: 4, offset: 2, duration: 30 };
  const at = 16;
  const source = getStudioClipMediaTime(clip, at);
  assert.equal(source, 14);

  let generation = gate.bump();
  const started = await startAt(media, gate, getStudioClipMediaTime(clip, clip.startTime), generation);
  assert.equal(started.started, true);
  assert.equal(media.currentTime, 2);

  generation = gate.bump();
  cancelStudioMediaPlayback(media);
  media.pause();
  seekStudioMediaElementIfNeeded(media, source);
  await flush();
  generation = gate.bump();
  const played = await startAt(media, gate, source, generation);
  assert.equal(played.started, true);
  assert.equal(played.targetSeek, source);
  assert.equal(media.currentTime, source);
  assert.equal(media.paused, false);
}

async function testMusicAndTwoVoicesStartTogether() {
  const gate = generationGate();
  const tracks = [
    {
      id: "music",
      sourceType: "catalog",
      media: createFakeMedia(),
      clip: { id: "m1", startTime: 0, offset: 0, duration: 180 },
    },
    {
      id: "voice-a",
      sourceType: "recording",
      media: createFakeMedia(),
      clip: { id: "a1", startTime: 0, offset: 0, duration: 90 },
    },
    {
      id: "voice-b",
      sourceType: "upload",
      media: createFakeMedia(),
      clip: { id: "b1", startTime: 0, offset: 5, duration: 80 },
    },
  ];
  const at = 33;
  const generation = gate.bump();
  const outcomes = await Promise.all(
    tracks.map((track) => {
      const plan = planStudioProviderPlayRestart({
        clips: [track.clip],
        timelineTime: at,
        staleActiveClipId: null,
        mediaCurrentTime: track.media.currentTime,
      });
      return startAt(track.media, gate, plan.seekTo, generation);
    }),
  );
  outcomes.forEach((outcome, index) => {
    const track = tracks[index];
    assert.equal(outcome.started, true, track.id);
    assert.equal(outcome.stale, false, track.id);
    assert.equal(track.media.paused, false, track.id);
    assert.equal(
      track.media.currentTime,
      getStudioClipMediaTime(track.clip, at),
      track.id,
    );
  });
  assert.equal(tracks[2].media.currentTime, 38);
}

async function testTrimEndThenPlayMiddle() {
  const gate = generationGate();
  const media = createFakeMedia();
  const buffer = 120;
  const trimmed = getStudioClipLayout(
    { startTime: 0, offset: 0, duration: 40 },
    buffer,
  );
  assert.equal(trimmed.duration, 40);
  const clip = { id: "music", ...trimmed };
  const middle = trimmed.startTime + trimmed.duration / 2;
  const source = getStudioClipMediaTime(clip, middle);
  assert.equal(source, 20);

  const parked = planStudioMediaElementSync({
    clips: [clip],
    timelineTime: middle,
    playing: false,
    activeClipId: null,
    mediaCurrentTime: 0,
  });
  assert.equal(parked.envelope, "silence");
  assert.equal(parked.activeClipId, null);
  assert.equal(parked.seekTo, source);
  seekStudioMediaElementIfNeeded(media, parked.seekTo ?? source);

  const generation = gate.bump();
  const played = await startAt(media, gate, source, generation);
  assert.equal(played.started, true);
  assert.equal(media.currentTime, source);
  assert.equal(media.paused, false);
}

async function testTrimStartNonZeroOffset() {
  const gate = generationGate();
  const media = createFakeMedia({ autoSeek: false });
  media.readyState = 0;
  const trimmed = getStudioClipLayout(
    { startTime: 0, offset: 15, duration: 50 },
    120,
  );
  const clip = { id: "music", ...trimmed };
  const timeline = 10;
  const source = getStudioClipMediaTime(clip, timeline);
  assert.equal(source, 25);

  const generation = gate.bump();
  const pending = startAt(media, gate, source, generation);
  await flush();
  assert.equal(media.seekAssignments, 0);
  assert.equal(media.currentTime, 0);
  media.emitLoadedMetadata();
  media.emitSeeked();
  const played = await pending;
  assert.equal(played.started, true);
  assert.equal(played.currentTimeBeforeSeek, 0);
  assert.equal(media.currentTime, source);
  assert.equal(media.paused, false);
  assert.equal(played.playCalled, true);
}

async function testPauseStopsEveryProjectElement() {
  const gate = generationGate();
  const tracks = [createFakeMedia(), createFakeMedia(), createFakeMedia()];
  const generation = gate.bump();
  const outcomes = await Promise.all(
    tracks.map((media) => startAt(media, gate, 12, generation)),
  );
  assert.ok(outcomes.every((outcome) => outcome.started));
  gate.bump();
  for (const media of tracks) {
    cancelStudioMediaPlayback(media);
    media.pause();
  }
  await flush();
  for (const media of tracks) {
    assert.equal(media.paused, true);
    assert.equal(media.seeking, false);
  }
}

async function testPendingPlayCannotResumeAfterPause() {
  const gate = generationGate();
  const media = createFakeMedia({
    autoSeek: false,
    holdPlay: true,
    rejectPlayWhileSeeking: false,
    resumeOnResolve: true,
    resumeOnSeeked: true,
  });
  const generation = gate.bump();
  const pending = startAt(media, gate, 18, generation);
  await flush();
  assert.equal(media.playCalls, 1);
  assert.equal(media.seeking, true);
  assert.equal(media.paused, false);

  gate.bump();
  cancelStudioMediaPlayback(media);
  media.pause();
  assert.equal(media.paused, true);

  media.emitSeeked();
  media.resolvePlay();
  const outcome = await pending;
  await flush();
  assert.equal(outcome.started, false);
  assert.equal(outcome.stale, true);
  assert.equal(media.paused, true);
  assert.equal(media.playCalls, 1);
  assert.equal(media.currentTime, 18);
}

async function testRejectedPlayDoesNotPretendToStart() {
  const gate = generationGate();
  const media = createFakeMedia({
    rejectPlayWith: "NotAllowedError",
    autoSeek: true,
  });
  const generation = gate.bump();
  const outcome = await startAt(media, gate, 22, generation);
  assert.equal(outcome.started, false);
  assert.equal(outcome.stale, false);
  assert.equal(outcome.playCalled, true);
  assert.equal(outcome.playSettled, "rejected");
  assert.equal(outcome.errorName, "NotAllowedError");
  assert.equal(media.playCalls, 1);
  assert.equal(media.paused, true);
  assert.equal(isStudioMediaStartBlocked(media, generation), true);
  const calls = media.playCalls;
  if (!isStudioMediaStartBlocked(media, generation)) {
    await startAt(media, gate, 22, generation);
  }
  assert.equal(media.playCalls, calls);
  assert.equal(STUDIO_MEDIA_PLAY_FAILED_MESSAGE.length > 0, true);
}

async function testAbortErrorRetriesOnceAfterSeeked() {
  const gate = generationGate();
  const media = createFakeMedia({
    autoSeek: false,
    rejectPlayWhileSeeking: true,
    resumeOnSeeked: false,
    resumeOnResolve: true,
  });
  const generation = gate.bump();
  let settled = false;
  const pending = startAt(media, gate, 22, generation).then((outcome) => {
    settled = true;
    return outcome;
  });
  await drain();
  assert.equal(settled, false);
  assert.equal(media.playCalls, 1);
  assert.deepEqual(media.playSeekingAtCall, [true]);
  assert.equal(media.seeking, true);
  assert.equal(media.paused, true);

  media.emitSeeked();
  const outcome = await pending;
  assert.equal(media.playCalls, 2);
  assert.deepEqual(media.playSeekingAtCall, [true, false]);
  assert.equal(outcome.started, true);
  assert.equal(outcome.stale, false);
  assert.equal(outcome.errorName, null);
  assert.equal(outcome.playSettled, "resolved");
  assert.equal(media.currentTime, 22);
  assert.equal(media.paused, false);
  assert.equal(media.seekAssignments, 1);
}

async function testNamedPlayErrorDoesNotRetry(
  errorName: "NotAllowedError" | "NotSupportedError",
) {
  const gate = generationGate();
  const media = createFakeMedia({
    autoSeek: false,
    rejectPlayWith: errorName,
    resumeOnSeeked: false,
    resumeOnResolve: true,
  });
  const generation = gate.bump();
  const outcome = await startAt(media, gate, 22, generation);
  assert.equal(media.playCalls, 1, errorName);
  assert.equal(outcome.started, false, errorName);
  assert.equal(outcome.stale, false, errorName);
  assert.equal(outcome.playSettled, "rejected", errorName);
  assert.equal(outcome.errorName, errorName);
  assert.equal(media.paused, true, errorName);
  assert.equal(media.seeking, true, errorName);
  media.emitSeeked();
  await drain();
  assert.equal(media.playCalls, 1, `${errorName} after late seeked`);
  assert.equal(media.paused, true, `${errorName} stays paused`);
  assert.equal(isStudioMediaStartBlocked(media, generation), true);
}

function createDelayedStartupTracks(clock: { after: (delayMs: number, fn: () => void) => void }) {
  const clips = {
    "voice-a": { id: "a", startTime: 0, offset: 0, duration: 120 },
    "voice-b": { id: "b", startTime: 0, offset: 2, duration: 120 },
    music: { id: "m", startTime: 0, offset: 8, duration: 180 },
  };
  return [
    {
      id: "voice-a" as const,
      clip: clips["voice-a"],
      media: createFakeMedia({
        autoSeek: true,
        rejectPlayWhileSeeking: true,
        resumeOnSeeked: false,
        resumeOnResolve: true,
      }),
    },
    {
      id: "voice-b" as const,
      clip: clips["voice-b"],
      media: createFakeMedia({
        autoSeek: false,
        rejectPlayWhileSeeking: true,
        resumeOnSeeked: false,
        resumeOnResolve: true,
        scheduleSeek: (emit) => clock.after(100, emit),
      }),
    },
    {
      id: "music" as const,
      clip: clips.music,
      media: createFakeMedia({
        autoSeek: false,
        rejectPlayWhileSeeking: true,
        resumeOnSeeked: false,
        resumeOnResolve: true,
        scheduleSeek: (emit) => clock.after(700, emit),
      }),
    },
  ];
}

async function testDelayedMultiTrackStartSharesOneAnchor() {
  const gate = generationGate();
  const generation = gate.bump();
  let contextTime = 0;
  const clock = createVirtualClock((now) => {
    contextTime = now;
  });
  const tracks = createDelayedStartupTracks(clock);
  const timeline = 40;
  assert.deepEqual(
    listStudioTracksAudibleAtPlayhead(
      tracks.map((track) => ({
        id: track.id,
        muted: false,
        clips: [track.clip],
      })),
      timeline,
    ),
    ["voice-a", "voice-b", "music"],
  );

  let hold = true;
  const status = "playing" as const;
  let anchorContext = -1;
  let anchorTimeline = -1;
  const position = timeline;
  const opened: Array<{
    id: string;
    contextTime: number;
    timeline: number;
    mediaTime: number;
  }> = [];
  const openers: Array<() => void> = [];

  const transportPosition = () => {
    if (hold || status !== "playing" || anchorContext < 0) return position;
    return anchorTimeline + (contextTime - anchorContext);
  };

  const pending = tracks.map((track) => {
    const target = getStudioClipMediaTime(track.clip, timeline);
    return beginStudioMediaPlayback({
      media: track.media,
      generation,
      isGenerationCurrent: (value) => gate.isCurrent(value),
      targetTime: target,
    }).then((outcome) => {
      if (outcome.started && gate.isCurrent(generation)) {
        openers.push(() => {
          opened.push({
            id: track.id,
            contextTime,
            timeline: transportPosition(),
            mediaTime: track.media.currentTime,
          });
        });
      }
      return { started: outcome.started, stale: outcome.stale };
    });
  });

  for (const track of tracks) {
    assert.equal(track.media.playCalls, 1, `${track.id} gesture play`);
    assert.equal(track.media.playSeekingAtCall[0], true, `${track.id} play during seek`);
  }
  assert.equal(opened.length, 0);

  let decision = "pending";
  const barrier = runStudioAudibleStartupBarrier({
    generation,
    isGenerationCurrent: (value) => gate.isCurrent(value),
    pending,
    onRelease: () => {
      anchorContext = contextTime;
      anchorTimeline = timeline;
      hold = false;
      for (const open of openers) open();
      decision = "release";
    },
    onStale: () => {
      decision = "stale";
    },
    onNoneStarted: () => {
      decision = "none";
    },
  });

  await drain();
  const voiceA = tracks[0];
  const voiceB = tracks[1];
  const music = tracks[2];
  assert.ok(voiceA && voiceB && music);
  assert.equal(voiceA.media.paused, false);
  assert.equal(voiceA.media.currentTime, 40);
  assert.equal(voiceB.media.seeking, true);
  assert.equal(music.media.seeking, true);
  assert.equal(opened.length, 0);
  contextTime = 0.7;
  assert.equal(transportPosition(), 40);
  assert.equal(decision, "pending");

  await clock.advance(100);
  assert.equal(clock.now, 100);
  assert.equal(voiceB.media.paused, false);
  assert.equal(voiceB.media.currentTime, 42);
  assert.equal(music.media.seeking, true);
  assert.equal(music.media.currentTime, 0);
  assert.equal(opened.length, 0, "voice must stay silent while catalog music seeks");
  assert.equal(transportPosition(), 40);
  assert.equal(decision, "pending");

  await clock.advance(600);
  await barrier;
  assert.equal(clock.now, 700);
  assert.equal(decision, "release");
  assert.equal(anchorTimeline, 40);
  assert.equal(anchorContext, 700);
  assert.equal(opened.length, 3);
  assert.deepEqual(
    opened.map((row) => row.id),
    ["voice-a", "voice-b", "music"],
  );
  for (const row of opened) {
    assert.equal(row.timeline, 40, row.id);
    assert.equal(row.contextTime, 700, row.id);
  }
  const releaseTimeline = transportPosition();
  assert.ok(Math.abs(releaseTimeline - 40) < 1e-9);
  for (const track of tracks) {
    const target = getStudioClipMediaTime(track.clip, 40);
    assert.equal(track.media.seekAssignments, 1, track.id);
    assert.equal(track.media.currentTime, target, track.id);
    assert.equal(track.media.paused, false, track.id);
    const frameLater = getStudioClipMediaTime(track.clip, 40.016);
    assert.equal(
      shouldCorrectStudioMediaDrift(track.media.currentTime, frameLater),
      false,
      `${track.id} frame drift`,
    );
    seekStudioMediaElementIfNeeded(track.media, frameLater);
    assert.equal(track.media.seekAssignments, 1, `${track.id} no corrective seek`);
    const spentInSeek = getStudioClipMediaTime(track.clip, 40.7);
    assert.equal(
      shouldCorrectStudioMediaDrift(track.media.currentTime, spentInSeek),
      true,
      `${track.id} would seek if the clock had run during startup`,
    );
  }
}

async function testSpaceDuringDelayedStartupCancelsEveryTrack() {
  const gate = generationGate();
  const generation = gate.bump();
  const clock = createVirtualClock();
  const tracks = createDelayedStartupTracks(clock);
  const timeline = 40;
  const openers: Array<() => void> = [];
  let resumed = 0;
  const pending = tracks.map((track) =>
    beginStudioMediaPlayback({
      media: track.media,
      generation,
      isGenerationCurrent: (value) => gate.isCurrent(value),
      targetTime: getStudioClipMediaTime(track.clip, timeline),
    }).then((outcome) => {
      if (outcome.started && gate.isCurrent(generation)) {
        openers.push(() => {
          resumed += 1;
        });
      }
      return { started: outcome.started, stale: outcome.stale };
    }),
  );

  let decision = "pending";
  const barrier = runStudioAudibleStartupBarrier({
    generation,
    isGenerationCurrent: (value) => gate.isCurrent(value),
    pending,
    onRelease: () => {
      for (const open of openers) open();
      decision = "release";
    },
    onStale: () => {
      decision = "stale";
    },
    onNoneStarted: () => {
      decision = "none";
    },
  });

  await drain();
  assert.equal(tracks[0]?.media.paused, false);
  assert.equal(tracks[2]?.media.seeking, true);
  gate.bump();
  const callsAfterCancel = tracks.map((track) => {
    cancelStudioMediaPlayback(track.media);
    track.media.pause();
    return track.media.playCalls;
  });
  await clock.advance(700);
  const result = await barrier;
  assert.equal(result, "stale");
  assert.equal(decision, "stale");
  assert.equal(resumed, 0);
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    assert.ok(track);
    assert.equal(track.media.paused, true, track.id);
    assert.equal(track.media.playCalls, callsAfterCancel[index], track.id);
  }
}

async function testCatalogPreviewStopsOnAddAndClose() {
  const preview = createFakeMedia({
    autoSeek: false,
    holdPlay: true,
    rejectPlayWhileSeeking: false,
    resumeOnResolve: true,
    resumeOnSeeked: false,
  });
  preview.src = "/api/studio/music/preview?publicationId=p&audioItemId=a&token=secret";
  const pending = beginStudioCatalogPreviewPlay(preview);
  await flush();
  assert.equal(preview.paused, false);
  assert.equal(preview.playCalls, 1);

  stopStudioCatalogPreview(preview);
  preview.resolvePlay();
  await pending;
  await flush();
  assert.equal(preview.paused, true);
  assert.equal(preview.loadCalls, 1);
  assert.equal(preview.srcRemoved, true);
  assert.equal(preview.src, "");
  assert.equal(preview.playCalls, 1);

  const stable = createFakeMedia({
    holdPlay: false,
    rejectPlayWhileSeeking: false,
    resumeOnResolve: true,
    resumeOnSeeked: false,
    autoSeek: false,
  });
  await beginStudioCatalogPreviewPlay(stable);
  assert.equal(stable.paused, false);
  stopStudioCatalogPreview(stable);
  await flush();
  assert.equal(stable.paused, true);
  assert.equal(stable.loadCalls, 1);
  assert.equal(stable.srcRemoved, true);
}

async function testRapidSeekPlayPauseKeepsEveryTrack() {
  const gate = generationGate();
  const tracks = [
    {
      id: "music",
      media: createFakeMedia(),
      clip: { id: "m", startTime: 0, offset: 0, duration: 90 },
    },
    {
      id: "voice-a",
      media: createFakeMedia(),
      clip: { id: "a", startTime: 0, offset: 1, duration: 90 },
    },
    {
      id: "voice-b",
      media: createFakeMedia(),
      clip: { id: "b", startTime: 0, offset: 3, duration: 90 },
    },
  ];
  const identities = tracks.map((track) => track.media);
  for (let step = 0; step < 20; step += 1) {
    const timeline = (step * 3) % 40;
    const generation = gate.bump();
    const outcomes = await Promise.all(
      tracks.map((track) =>
        startAt(
          track.media,
          gate,
          getStudioClipMediaTime(track.clip, timeline),
          generation,
        ),
      ),
    );
    assert.equal(outcomes.length, 3);
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      assert.equal(track.media, identities[index], `${track.id} disappeared`);
      assert.equal(outcomes[index].started, true, `${track.id} step ${step}`);
      assert.equal(track.media.paused, false, `${track.id} step ${step}`);
      assert.equal(
        track.media.currentTime,
        getStudioClipMediaTime(track.clip, timeline),
        `${track.id} step ${step}`,
      );
    }
    gate.bump();
    for (const track of tracks) {
      cancelStudioMediaPlayback(track.media);
      track.media.pause();
    }
    await flush();
    for (const track of tracks) {
      assert.equal(track.media.paused, true);
    }
  }
}

function testPauseDiagnosticsIdentifyProjectAndPreview() {
  const project = createFakeMedia({ autoSeek: false });
  project.readyState = 1;
  project.networkState = 1;
  seekStudioMediaElementIfNeeded(project, 14);
  const preview = createFakeMedia({ autoSeek: false });
  preview.src = "https://audiolad.ru/api/studio/music/preview?token=secret";
  preview.readyState = 4;
  preview.networkState = 1;
  const rows = [
    describeStudioAudioElement({
      role: "project-runtime",
      trackId: "track-music",
      sourceType: "catalog",
      media: project,
    }),
    describeStudioAudioElement({
      role: "catalog-preview",
      media: preview,
    }),
  ];
  assert.equal(rows[0].role, "project-runtime");
  assert.equal(rows[0].trackId, "track-music");
  assert.equal(rows[0].sourceType, "catalog");
  assert.equal(rows[0].seeking, true);
  assert.equal(rows[0].currentTime, 0);
  assert.equal(rows[0].readyState, 1);
  assert.equal(rows[0].networkState, 1);
  assert.equal(rows[0].paused, true);
  assert.equal(rows[0].src.includes("token"), false);
  assert.match(rows[0].src, /track\.mp3$/);
  assert.equal(rows[1].role, "catalog-preview");
  assert.equal(rows[1].trackId, null);
  assert.equal(rows[1].src.includes("token"), false);
  publishStudioPauseDiagnostics(rows);
  assert.equal(readStudioPauseDiagnostics().length, 2);
  const summary = formatStudioPauseAudioDiagnostics(rows);
  assert.match(summary, /project:track-music:catalog/);
  assert.match(summary, /catalog-preview/);
  assert.match(summary, /seeking=true/);
}

async function testProviderAndCatalogWiring() {
  const provider = await readFile(
    new URL("../src/components/studio/StudioAudioProvider.tsx", import.meta.url),
    "utf8",
  );
  const overlay = await readFile(
    new URL("../src/components/studio/StudioMusicCatalogOverlay.tsx", import.meta.url),
    "utf8",
  );
  assert.match(provider, /beginStudioMediaPlayback/);
  assert.match(provider, /runStudioAudibleStartupBarrier/);
  assert.match(provider, /playbackStartupHoldRef/);
  assert.match(
    provider,
    /if \(playbackStartupHoldRef\.current\) \{\s*return positionRef\.current;\s*\}/,
  );
  assert.match(provider, /playbackStartupHoldRef\.current = false/);
  const startFn = provider.slice(
    provider.indexOf("const startSourcesAtPosition"),
    provider.indexOf("const playbackUrlStillReferenced"),
  );
  const prelude = startFn.slice(0, startFn.indexOf("const releaseStartup"));
  const releaseBody = startFn.slice(
    startFn.indexOf("const releaseStartup"),
    startFn.indexOf("void runStudioAudibleStartupBarrier"),
  );
  assert.doesNotMatch(prelude, /startProgressLoop\(/);
  assert.doesNotMatch(prelude, /startedAtContextTimeRef/);
  assert.match(releaseBody, /startedAtContextTimeRef\.current = now/);
  assert.match(releaseBody, /startedAtPositionRef\.current = position/);
  assert.match(releaseBody, /startProgressLoop\(\)/);
  assert.match(startFn, /deferAudibleEnvelope: audible\.has\(track\.id\)/);
  assert.match(provider, /if \(!outcome\.started\)/);
  assert.match(provider, /scheduleClipEnvelope/);
  assert.match(provider, /parkPausedRuntimesAtPlayhead\(\)/);
  assert.match(provider, /publishStudioPauseDiagnostics/);
  assert.match(provider, /stopMountedStudioCatalogPreviews/);
  assert.match(provider, /STUDIO_MEDIA_PLAY_FAILED_MESSAGE/);
  assert.doesNotMatch(provider, /media\.play\(\)\.catch\(\(\) => \{/);
  assert.match(
    overlay,
    /onAdd=\{\(next, audioItemId\) => \{\s*stopPreview\(\);\s*onAdd\?\.\(next\.publication_id, audioItemId\);/,
  );
  assert.match(overlay, /stopStudioCatalogPreview\(audioRef\.current\)/);
  assert.match(overlay, /data-studio-audio-role=\{STUDIO_CATALOG_PREVIEW_AUDIO_ROLE\}/);
  assert.match(overlay, /if \(!open\) \{\s*return null;\s*\}/);
  assert.match(overlay, /beginStudioCatalogPreviewPlay/);
  assert.doesNotMatch(
    overlay,
    /return \(\) => \{\s*document\.removeEventListener\("keydown", onKeyDown\);\s*if \(audio\)/,
  );
  const logged = readStudioMediaPlayOutcomes();
  assert.ok(logged.length > 0);
  assert.ok(logged.some((outcome) => outcome.playCalled && outcome.targetSeek !== 0));
}

testSeekRestartIsTheSilenceMechanism();
await testCatalogMusicMidClipAfterPause();
await testVoiceSameMidClipPath();
await testMusicAndTwoVoicesStartTogether();
await testTrimEndThenPlayMiddle();
await testTrimStartNonZeroOffset();
await testPauseStopsEveryProjectElement();
await testPendingPlayCannotResumeAfterPause();
await testRejectedPlayDoesNotPretendToStart();
await testAbortErrorRetriesOnceAfterSeeked();
await testNamedPlayErrorDoesNotRetry("NotAllowedError");
await testNamedPlayErrorDoesNotRetry("NotSupportedError");
await testDelayedMultiTrackStartSharesOneAnchor();
await testSpaceDuringDelayedStartupCancelsEveryTrack();
await testCatalogPreviewStopsOnAddAndClose();
await testRapidSeekPlayPauseKeepsEveryTrack();
testPauseDiagnosticsIdentifyProjectAndPreview();
await testProviderAndCatalogWiring();

console.log("studio media-element lifecycle checks passed");
