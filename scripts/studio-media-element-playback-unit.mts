import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getFallbackWaveformPeaks } from "../src/lib/studio/fallback-waveform";
import {
  createLocalStudioPlaybackAsset,
  createStudioObjectUrl,
  isStudioObjectUrl,
  readHtmlMediaDuration,
  revokeStudioObjectUrl,
  waitForStudioMediaMetadata,
} from "../src/lib/studio/local-playback-asset";
import {
  countActiveStudioClips,
  findActiveStudioClip,
  findNextStudioClip,
  getStudioClipMediaTime,
  isStudioPlaybackGenerationCurrent,
  listStudioTracksAudibleAtPlayhead,
  nextStudioPlaybackGeneration,
  planStudioMediaElementSync,
  shouldCorrectStudioMediaDrift,
  STUDIO_MEDIA_DRIFT_SEEK_SECONDS,
} from "../src/lib/studio/media-element-sync";
import {
  applyStudioMediaElementSrcRefresh,
  createStudioPlaybackRangeRequestInit,
  getStudioPlaybackExpiryMs,
  isPartialContentStatus,
  parseStudioPlaybackExpiry,
  shouldRefreshStudioPlaybackUrl,
  STUDIO_PLAYBACK_URL_REFRESH_MARGIN_MS,
  STUDIO_PLAYBACK_URL_TTL_SECONDS,
} from "../src/lib/studio/signed-playback";
import {
  getStudioClipMoveLayout,
  getStudioSameTrackBounds,
  splitStudioClip,
  studioTrackHasOverlappingClips,
} from "../src/lib/studio/clip-math";

function testClipSyncMath() {
  const clip = { startTime: 10, offset: 30, duration: 20 };
  assert.equal(getStudioClipMediaTime(clip, 10), 30);
  assert.equal(getStudioClipMediaTime(clip, 25), 45);
  assert.equal(getStudioClipMediaTime(clip, 30), 50);
  assert.equal(getStudioClipMediaTime(clip, 5), 30);
  assert.equal(findActiveStudioClip([clip], 9), null);
  assert.equal(findActiveStudioClip([clip], 10), clip);
  assert.equal(findActiveStudioClip([clip], 29.9), clip);
  assert.equal(findActiveStudioClip([clip], 30), null);
  assert.equal(findNextStudioClip([clip], 0), clip);
  assert.equal(findNextStudioClip([clip], 10), null);
  assert.equal(shouldCorrectStudioMediaDrift(45, 45.1), false);
  assert.equal(
    shouldCorrectStudioMediaDrift(45, 45 + STUDIO_MEDIA_DRIFT_SEEK_SECONDS + 0.01),
    true,
  );
}

function testSignedPlaybackHelpers() {
  assert.equal(STUDIO_PLAYBACK_URL_TTL_SECONDS, 4 * 60 * 60);
  assert.equal(STUDIO_PLAYBACK_URL_REFRESH_MARGIN_MS, 5 * 60 * 1000);
  const now = Date.parse("2026-09-06T12:00:00.000Z");
  assert.equal(getStudioPlaybackExpiryMs(3600, now), now + 3_600_000);
  assert.equal(parseStudioPlaybackExpiry("2026-09-06T16:00:00.000Z"), Date.parse("2026-09-06T16:00:00.000Z"));
  assert.equal(parseStudioPlaybackExpiry(now + 1000), now + 1000);
  assert.equal(parseStudioPlaybackExpiry("not-a-date"), null);
  assert.equal(shouldRefreshStudioPlaybackUrl(now + 60_000, now), true);
  assert.equal(shouldRefreshStudioPlaybackUrl(now + 20 * 60_000, now), false);
  assert.equal(shouldRefreshStudioPlaybackUrl(null, now), true);
  const range = createStudioPlaybackRangeRequestInit(1_048_576, 1_049_599);
  assert.equal((range.headers as Record<string, string>).Range, "bytes=1048576-1049599");
  assert.equal(isPartialContentStatus(206), true);
  assert.equal(isPartialContentStatus(200), false);
}

function testObjectUrlDisposal() {
  const created: string[] = [];
  const revoked: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => {
    const url = `blob:https://audiolad.ru/${created.length + 1}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
  try {
    const url = createStudioObjectUrl(new Blob(["audio"]));
    assert.equal(isStudioObjectUrl(url), true);
    revokeStudioObjectUrl(url);
    revokeStudioObjectUrl("https://audiolad.ru/storage/v1/object/sign/x");
    assert.deepEqual(revoked, [url]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
}

async function testLocalAssetUsesMetadataNotDecode() {
  const created: string[] = [];
  const revoked: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => {
    const url = `blob:https://audiolad.ru/local-${created.length + 1}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };

  const listeners = new Map<string, () => void>();
  const probe = {
    preload: "",
    src: "",
    duration: 4281.44,
    readyState: 0,
    pause() {},
    load() {},
    removeAttribute() {},
    addEventListener(type: string, handler: () => void) {
      listeners.set(type, handler);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
  };

  try {
    const pending = createLocalStudioPlaybackAsset(
      new File(["x"], "air.mp3", { type: "audio/mpeg" }),
      {
        createAudio: () => probe as unknown as HTMLAudioElement,
      },
    );
    listeners.get("loadedmetadata")?.();
    const asset = await pending;
    assert.equal(asset.duration, 4281.44);
    assert.equal(asset.ownsObjectUrl, true);
    assert.equal(created.length, 1);
    assert.equal(revoked.length, 0);
    revokeStudioObjectUrl(asset.playbackUrl);
    assert.deepEqual(revoked, created);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
}

async function testMetadataWaitAbortAndErrors() {
  assert.equal(readHtmlMediaDuration({ duration: 12 }), 12);
  assert.equal(readHtmlMediaDuration({ duration: Number.POSITIVE_INFINITY }), null);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => waitForStudioMediaMetadata({
      duration: Number.NaN,
      readyState: 0,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLMediaElement, controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
}

function testSameTrackOverlapImpossibleAndAtMostOneActive() {
  const clips = [
    { id: "a", startTime: 0, offset: 0, duration: 10 },
    { id: "b", startTime: 14, offset: 30, duration: 8 },
  ];
  const moved = getStudioClipMoveLayout({
    layout: clips[0],
    bufferDuration: 120,
    requestedStartTime: 12,
    snapTargets: [],
    pixelsPerSecond: 40,
    collisionBounds: getStudioSameTrackBounds(clips[0], clips),
  });
  assert.equal(studioTrackHasOverlappingClips([moved, clips[1]]), false);
  const split = splitStudioClip(
    { ...clips[1], fadeInDuration: 0, fadeOutDuration: 0 },
    18,
    "b-right",
  );
  assert.ok(split);
  const afterSplit = [clips[0], split.left, split.right];
  assert.equal(studioTrackHasOverlappingClips(afterSplit), false);
  for (let time = 0; time <= 22; time += 0.25) {
    assert.ok(countActiveStudioClips(afterSplit, time) <= 1);
  }
}

function testGapPlaybackKeepsUserGesture() {
  const clips = [
    { id: "a", startTime: 0, offset: 0, duration: 5 },
    { id: "b", startTime: 10, offset: 20, duration: 5 },
  ];
  const afterA = planStudioMediaElementSync({
    clips,
    timelineTime: 5,
    playing: true,
    activeClipId: "a",
    mediaCurrentTime: 5,
    mediaEnded: false,
  });
  assert.equal(afterA.envelope, "silence");
  assert.equal(afterA.wantPlaying, true);
  assert.equal(afterA.loop, true);
  assert.equal(afterA.activeClipId, null);

  const endedInGap = planStudioMediaElementSync({
    clips,
    timelineTime: 7,
    playing: true,
    activeClipId: null,
    mediaCurrentTime: 71,
    mediaEnded: true,
  });
  assert.equal(endedInGap.seekTo, 0);
  assert.equal(endedInGap.wantPlaying, true);

  const enterB = planStudioMediaElementSync({
    clips,
    timelineTime: 10,
    playing: true,
    activeClipId: null,
    mediaCurrentTime: 0,
  });
  assert.equal(enterB.activeClipId, "b");
  assert.equal(enterB.wantPlaying, true);
  assert.equal(enterB.loop, false);
  assert.equal(enterB.enteredClip, true);
  assert.equal(enterB.seekTo, 20);

  const pausedGap = planStudioMediaElementSync({
    clips,
    timelineTime: 7,
    playing: false,
    activeClipId: null,
    mediaCurrentTime: 0,
  });
  assert.equal(pausedGap.wantPlaying, false);
  assert.equal(pausedGap.loop, false);
}

function testSignedUrlRefreshDoesNotRecreateSource() {
  const media = {
    src: "https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/a?token=old",
    currentTime: 1800.5,
  };
  const same = applyStudioMediaElementSrcRefresh(media, media.src);
  assert.equal(same.srcChanged, false);
  assert.equal(same.recreateMediaElementSource, false);
  assert.equal(same.preservedTime, 1800.5);

  const next =
    "https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/a?token=new";
  const refreshed = applyStudioMediaElementSrcRefresh(media, next);
  assert.equal(refreshed.srcChanged, true);
  assert.equal(refreshed.recreateMediaElementSource, false);
  assert.equal(refreshed.preservedTime, 1800.5);
  assert.equal(media.src, next);
  assert.equal(STUDIO_PLAYBACK_URL_TTL_SECONDS, 4 * 60 * 60);
}

function testFallbackWaveform() {
  const peaks = getFallbackWaveformPeaks(4281.44, 16, 7);
  assert.equal(peaks.minimums.length, 16);
  assert.equal(peaks.maximums.length, 16);
  assert.ok([...peaks.maximums].every((value) => value >= 0 && value <= 1));
  const again = getFallbackWaveformPeaks(4281.44, 16, 7);
  assert.deepEqual([...peaks.maximums], [...again.maximums]);
}

async function testProviderAndHydrationContracts() {
  const provider = await readFile(
    new URL("../src/components/studio/StudioAudioProvider.tsx", import.meta.url),
    "utf8",
  );
  const hydration = await readFile(
    new URL("../src/lib/studio/hydration.ts", import.meta.url),
    "utf8",
  );
  const shell = await readFile(
    new URL("../src/components/studio/PersistedStudioProjectShell.tsx", import.meta.url),
    "utf8",
  );
  const playbackRoute = await readFile(
    new URL(
      "../src/app/api/studio/projects/[projectId]/assets/[assetId]/playback/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const renderWorker = await readFile(
    new URL("../src/lib/studio/render/worker-runtime.ts", import.meta.url),
    "utf8",
  );
  const ir = await readFile(
    new URL("../src/lib/studio/voice-preset-dsp.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(provider, /decodeAudioData|arrayBuffer\(/);
  assert.match(provider, /createMediaElementSource/);
  assert.equal([...provider.matchAll(/createMediaElementSource/g)].length, 1);
  assert.match(provider, /preload = "metadata"/);
  assert.match(provider, /revokeStudioObjectUrl/);
  assert.match(provider, /shouldRefreshStudioPlaybackUrl/);
  assert.match(provider, /planStudioMediaElementSync/);
  assert.match(provider, /forceEnter: true/);
  assert.match(provider, /playbackGenerationRef/);
  assert.match(provider, /nextStudioPlaybackGeneration/);
  assert.match(provider, /isStudioPlaybackGenerationCurrent/);
  assert.match(provider, /runtime\.activeClipId = null/);
  assert.match(provider, /applyStudioMediaElementSrcRefresh/);
  assert.match(provider, /studioTrackHasOverlappingClips/);
  assert.match(provider, /appendStudioClipsIfNoOverlap/);
  assert.match(provider, /media\.loop = plan\.loop/);
  assert.match(provider, /statusRef\.current === "playing"/);
  assert.match(hydration, /signPlayback/);
  assert.doesNotMatch(hydration, /downloadStudio|decodeAudioData|AudioBuffer/);
  assert.match(shell, /getStudioAssetPlaybackUrl/);
  assert.doesNotMatch(shell, /downloadStudioProjectAsset/);
  assert.match(playbackRoute, /createStudioAssetPlaybackUrl/);
  assert.doesNotMatch(playbackRoute, /downloadStudioProjectAsset|arrayBuffer/);
  assert.match(renderWorker, /arrayBuffer/);
  assert.match(ir, /AudioBuffer/);

  const fadeMath = await readFile(
    new URL("../src/lib/studio/fade-math.ts", import.meta.url),
    "utf8",
  );
  const ffmpeg = await readFile(
    new URL("../src/lib/studio/render/ffmpeg.ts", import.meta.url),
    "utf8",
  );
  assert.match(fadeMath, /STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS = 0\.01/);
  assert.match(fadeMath, /resolveStudioPlaybackClipFades/);
  assert.match(fadeMath, /isStudioContiguousSourceSeam/);
  assert.match(provider, /resolveStudioPlaybackClipFades/);
  assert.match(provider, /resolveStudioClipEnterHandoff/);
  assert.match(provider, /enterHandoff === "from-silence"/);
  assert.match(provider, /enterHandoff === "flat"/);
  assert.match(provider, /authored fade-in/);
  assert.match(fadeMath, /resolveStudioClipEnterHandoff/);
  assert.match(
    provider,
    /do not pretend this path is a soft de-click/,
  );
  assert.doesNotMatch(
    provider,
    /stopSources[\s\S]{0,400}linearRampToValueAtTime\(\s*0,\s*contextTime \+ STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS/,
  );
  assert.match(ffmpeg, /resolveStudioPlaybackClipFades\(clip, clip\.duration/);
  assert.match(ffmpeg, /playbackFades\.fadeInDuration/);
  assert.match(ffmpeg, /orderedClips/);
  assert.match(provider, /fadeInDuration: 0/);
  assert.match(provider, /fadeOutDuration: 0/);
}


function testPausedSeekDoesNotArmEnvelope() {
  const clips = [{ id: "m1", startTime: 0, offset: 0, duration: 120 }];
  const parked = planStudioMediaElementSync({
    clips,
    timelineTime: 40,
    playing: false,
    activeClipId: null,
    mediaCurrentTime: 0,
  });
  assert.equal(parked.envelope, "silence");
  assert.equal(parked.activeClipId, null);
  assert.equal(parked.enteredClip, false);
  assert.equal(parked.wantPlaying, false);
  assert.equal(parked.seekTo, 40);

  // Previously paused seeks armed activeClipId; the next Play then skipped
  // envelope rebuild (enteredClip=false). Parking must leave active disarmed.
  const afterParkedPlay = planStudioMediaElementSync({
    clips,
    timelineTime: 40,
    playing: true,
    activeClipId: parked.activeClipId,
    mediaCurrentTime: parked.seekTo ?? 0,
    forceEnter: true,
  });
  assert.equal(afterParkedPlay.enteredClip, true);
  assert.equal(afterParkedPlay.envelope, "clip");
  assert.equal(afterParkedPlay.seekTo, 40);
  assert.equal(afterParkedPlay.wantPlaying, true);
}

function testSequentialSeeksThenPlayForceEnter() {
  const clips = [{ id: "voice", startTime: 5, offset: 2, duration: 30 }];
  let active = null;
  let mediaTime = 0;
  const seeks = [8, 20, 12, 25];
  for (const t of seeks) {
    const plan = planStudioMediaElementSync({
      clips,
      timelineTime: t,
      playing: false,
      activeClipId: active,
      mediaCurrentTime: mediaTime,
    });
    assert.equal(plan.activeClipId, null);
    assert.equal(plan.enteredClip, false);
    assert.equal(plan.envelope, "silence");
    assert.equal(plan.seekTo, getStudioClipMediaTime(clips[0], t));
    active = plan.activeClipId;
    mediaTime = plan.seekTo ?? mediaTime;
  }
  const play = planStudioMediaElementSync({
    clips,
    timelineTime: 25,
    playing: true,
    activeClipId: active,
    mediaCurrentTime: mediaTime,
    forceEnter: true,
  });
  assert.equal(play.enteredClip, true);
  assert.equal(play.seekTo, getStudioClipMediaTime(clips[0], 25));
  assert.equal(play.elapsedClipTime, 20);
}

function testMultiTrackAudibleAtPlayheadIgnoresSelectionZoom() {
  const tracks = [
    {
      id: "music",
      muted: false,
      clips: [{ id: "m", startTime: 0, offset: 0, duration: 100 }],
    },
    {
      id: "voice-a",
      muted: false,
      clips: [{ id: "a", startTime: 10, offset: 0, duration: 40 }],
    },
    {
      id: "voice-b",
      muted: false,
      clips: [{ id: "b", startTime: 15, offset: 1, duration: 20 }],
    },
    {
      id: "muted-voice",
      muted: true,
      clips: [{ id: "x", startTime: 0, offset: 0, duration: 100 }],
    },
  ];
  assert.deepEqual(listStudioTracksAudibleAtPlayhead(tracks, 5), ["music"]);
  assert.deepEqual(listStudioTracksAudibleAtPlayhead(tracks, 12), [
    "music",
    "voice-a",
  ]);
  assert.deepEqual(listStudioTracksAudibleAtPlayhead(tracks, 16), [
    "music",
    "voice-a",
    "voice-b",
  ]);
  assert.deepEqual(listStudioTracksAudibleAtPlayhead(tracks, 50), ["music"]);
}

function testStalePlaybackGenerationCannotMutate() {
  let generation = 0;
  generation = nextStudioPlaybackGeneration(generation);
  const started = generation;
  generation = nextStudioPlaybackGeneration(generation);
  assert.equal(isStudioPlaybackGenerationCurrent(started, generation), false);
  assert.equal(isStudioPlaybackGenerationCurrent(generation, generation), true);
}

function testForceEnterReopensSameClipAfterPause() {
  const clips = [{ id: "m1", startTime: 0, offset: 10, duration: 60 }];
  // Simulate the old broken path: activeClipId still armed, gain would stay 0.
  const broken = planStudioMediaElementSync({
    clips,
    timelineTime: 30,
    playing: true,
    activeClipId: "m1",
    mediaCurrentTime: 40,
  });
  assert.equal(broken.enteredClip, false);
  assert.equal(broken.seekTo, null);

  const fixed = planStudioMediaElementSync({
    clips,
    timelineTime: 30,
    playing: true,
    activeClipId: "m1",
    mediaCurrentTime: 40,
    forceEnter: true,
  });
  assert.equal(fixed.enteredClip, true);
  assert.equal(fixed.seekTo, 40);
}


testClipSyncMath();
testSignedPlaybackHelpers();
testObjectUrlDisposal();
await testLocalAssetUsesMetadataNotDecode();
await testMetadataWaitAbortAndErrors();
testSameTrackOverlapImpossibleAndAtMostOneActive();
testGapPlaybackKeepsUserGesture();
testPausedSeekDoesNotArmEnvelope();
testSequentialSeeksThenPlayForceEnter();
testMultiTrackAudibleAtPlayheadIgnoresSelectionZoom();
testStalePlaybackGenerationCannotMutate();
testForceEnterReopensSameClipAfterPause();
testSignedUrlRefreshDoesNotRecreateSource();
testFallbackWaveform();
await testProviderAndHydrationContracts();

console.log("studio media-element playback checks passed");
