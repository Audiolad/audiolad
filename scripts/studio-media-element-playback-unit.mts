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
  findActiveStudioClip,
  findNextStudioClip,
  getStudioClipMediaTime,
  shouldCorrectStudioMediaDrift,
  STUDIO_MEDIA_DRIFT_SEEK_SECONDS,
} from "../src/lib/studio/media-element-sync";
import {
  createStudioPlaybackRangeRequestInit,
  getStudioPlaybackExpiryMs,
  isPartialContentStatus,
  parseStudioPlaybackExpiry,
  shouldRefreshStudioPlaybackUrl,
  STUDIO_PLAYBACK_URL_REFRESH_MARGIN_MS,
  STUDIO_PLAYBACK_URL_TTL_SECONDS,
} from "../src/lib/studio/signed-playback";

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
  assert.match(provider, /preload = "metadata"/);
  assert.match(provider, /revokeStudioObjectUrl/);
  assert.match(provider, /shouldRefreshStudioPlaybackUrl/);
  assert.match(hydration, /signPlayback/);
  assert.doesNotMatch(hydration, /downloadStudio|decodeAudioData|AudioBuffer/);
  assert.match(shell, /getStudioAssetPlaybackUrl/);
  assert.doesNotMatch(shell, /downloadStudioProjectAsset/);
  assert.match(playbackRoute, /createStudioAssetPlaybackUrl/);
  assert.doesNotMatch(playbackRoute, /downloadStudioProjectAsset|arrayBuffer/);
  assert.match(renderWorker, /arrayBuffer/);
  assert.match(ir, /AudioBuffer/);
}

testClipSyncMath();
testSignedPlaybackHelpers();
testObjectUrlDisposal();
await testLocalAssetUsesMetadataNotDecode();
await testMetadataWaitAbortAndErrors();
testFallbackWaveform();
await testProviderAndHydrationContracts();

console.log("studio media-element playback checks passed");
