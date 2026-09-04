#!/usr/bin/env node
/**
 * Paid-product preview audio + practice progress write security.
 * No database. No original-file URL for preview-only access.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isOriginalPracticeAudioSignedUrl } from "../src/lib/audio/signed-audio-url";
import {
  canWritePracticeProgress,
  isCatalogStorefrontPreviewEligible,
  resolveListenApiDecision,
} from "../src/lib/listen/preview-access";
import {
  buildListenPreviewClipPath,
  isListenPreviewClipPath,
  parseHttpByteRange,
  sliceBytesForRange,
} from "../src/lib/listen/preview-clip-http";
import { resolvePreviewClipMediaTimeline } from "../src/lib/listen/preview-player-timeline";
import { resolvePlaybackPreviewWindow } from "../src/lib/listen/preview-window";
import {
  extractMp3TimeRange,
  extractMp3TimeRangeFromStream,
  peekMp3FrameLayout,
} from "../src/lib/listen/mp3-preview-clip";
import { resolvePreviewClipWindow } from "../src/lib/listen/serve-preview-clip";
import { resolveCatalogPlaybackMode } from "../src/lib/catalog/catalog-playback-contract";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function writeMpeg1Layer3Frame(bitrateIndex: number, marker: number): Uint8Array {
  const header =
    0xffe00000 |
    (3 << 19) |
    (1 << 17) |
    (1 << 16) |
    (bitrateIndex << 12);
  const bytes = new Uint8Array(4);
  bytes[0] = (header >>> 24) & 0xff;
  bytes[1] = (header >>> 16) & 0xff;
  bytes[2] = (header >>> 8) & 0xff;
  bytes[3] = header & 0xff;
  const layout = peekMp3FrameLayout(bytes, 0);
  assert.ok(layout, `valid test frame header bitrateIndex=${bitrateIndex}`);
  const frame = new Uint8Array(layout.length);
  frame.set(bytes);
  frame[4] = marker;
  return frame;
}

function concatFrames(frames: Uint8Array[]): Uint8Array {
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }

  return out;
}

function buildTestMp3(options: {
  durationMs: number;
  vbr?: boolean;
  id3?: boolean;
}): { bytes: Uint8Array; frameDurationMs: number } {
  const probe = writeMpeg1Layer3Frame(9, 1);
  const layout = peekMp3FrameLayout(probe, 0);
  assert.ok(layout);
  const frameDurationMs = layout.durationMs;
  const count = Math.ceil(options.durationMs / frameDurationMs) + 2;
  const frames: Uint8Array[] = [];

  for (let index = 0; index < count; index += 1) {
    const bitrateIndex = options.vbr && index % 2 === 1 ? 5 : 9;
    frames.push(writeMpeg1Layer3Frame(bitrateIndex, (index % 250) + 1));
  }

  let bytes = concatFrames(frames);

  if (options.id3) {
    const id3 = new Uint8Array(20);
    id3.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a]);
    const withId3 = new Uint8Array(id3.length + bytes.length);
    withId3.set(id3);
    withId3.set(bytes, id3.length);
    bytes = withId3;
  }

  return { bytes, frameDurationMs };
}

function testAccessDecisions() {
  const catalogEligible = true;
  const entitled = { mode: "entitled" as const };
  const author = { mode: "author_preview" as const };

  const previewOnly = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: catalogEligible,
    listenAccess: null,
  });
  assert.equal(previewOnly.ok, true);
  if (previewOnly.ok) {
    assert.equal(previewOnly.access.mode, "catalog_preview");
    assert.equal(previewOnly.useServiceRoleStorage, true);
    assert.equal(canWritePracticeProgress(previewOnly.access), false);
  }

  const previewProgress = resolveListenApiDecision({
    purpose: "progress",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: catalogEligible,
    listenAccess: null,
  });
  assert.equal(previewProgress.ok, false, "preview-only cannot write progress");

  const previewFullAudio = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: catalogEligible,
    listenAccess: null,
  });
  assert.equal(previewFullAudio.ok, false, "preview query does not grant full audio");

  for (const reason of ["purchased", "granted", "admin"] as const) {
    const entitledDecision = resolveListenApiDecision({
      purpose: "full_audio",
      isCourse: false,
      courseAllowed: false,
      canListen: true,
      accessReason: reason,
      catalogPreviewEligible: catalogEligible,
      listenAccess: entitled,
    });
    assert.equal(entitledDecision.ok, true, `${reason} keeps full audio`);
    if (entitledDecision.ok) {
      assert.equal(entitledDecision.access.mode, "entitled");
      assert.equal(canWritePracticeProgress(entitledDecision.access), true);
    }
  }

  const freeDecision = resolveListenApiDecision({
    purpose: "progress",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: "free",
    catalogPreviewEligible: true,
    listenAccess: entitled,
  });
  assert.equal(freeDecision.ok, true);
  if (freeDecision.ok) {
    assert.equal(freeDecision.useServiceRoleStorage, true);
    assert.equal(canWritePracticeProgress(freeDecision.access), true);
  }

  const guestPromo = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: "guest_promo",
    catalogPreviewEligible: true,
    listenAccess: entitled,
  });
  assert.equal(guestPromo.ok, true, "guest_promo stays full listen");
  if (guestPromo.ok) {
    assert.equal(guestPromo.access.mode, "entitled");
    assert.notEqual(guestPromo.access.mode, "catalog_preview");
  }

  const authorDecision = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: "author_owner",
    catalogPreviewEligible: false,
    listenAccess: author,
  });
  assert.equal(authorDecision.ok, true);
  if (authorDecision.ok) {
    assert.equal(authorDecision.access.mode, "author_preview");
    assert.equal(canWritePracticeProgress(authorDecision.access), true);
  }

  const coursePreview = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(coursePreview.ok, false, "course preview cannot bypass course access");

  const courseEntitled = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: true,
    courseAllowed: true,
    canListen: true,
    accessReason: "purchased",
    catalogPreviewEligible: true,
    listenAccess: entitled,
  });
  assert.equal(courseEntitled.ok, true);

  assert.equal(
    isCatalogStorefrontPreviewEligible({
      status: "published",
      is_catalog_listed: true,
    }),
    true,
  );
  assert.equal(
    isCatalogStorefrontPreviewEligible({
      status: "draft",
      is_catalog_listed: true,
    }),
    false,
  );
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: false, accessState: "paid" }),
    "preview",
  );
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: true, accessState: "paid" }),
    "full",
  );
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: false, accessState: "free" }),
    "full",
  );
}

function testPreviewWindows() {
  const custom = resolvePreviewClipWindow({
    preview_start_ms: 45_000,
    preview_end_ms: 75_000,
    duration_seconds: 180,
  });
  assert.equal(custom.startMs, 45_000);
  assert.equal(custom.endMs, 75_000);
  assert.equal(custom.source, "configured");

  const fallback = resolvePreviewClipWindow({
    preview_start_ms: null,
    preview_end_ms: null,
    duration_seconds: 240,
  });
  assert.equal(fallback.startMs, 0);
  assert.equal(fallback.endMs, 60_000);
  assert.equal(fallback.source, "compatibility_fallback");

  const ignoredClient = resolvePlaybackPreviewWindow(
    { previewStartMs: 45_000, previewEndMs: 75_000 },
    180_000,
  );
  assert.notEqual(ignoredClient.startMs, 0);
  assert.notEqual(ignoredClient.endMs, 180_000);
}

function testMp3ClipSecurity() {
  const { bytes, frameDurationMs } = buildTestMp3({
    durationMs: 90_000,
    vbr: true,
    id3: true,
  });
  const firstMarker = bytes[readFirstFrameOffset(bytes) + 4];

  const custom = extractMp3TimeRange(bytes, 45_000, 75_000);
  assert.ok(custom.bytes.byteLength < bytes.byteLength, "clip is smaller than original");
  assert.ok(custom.durationMs >= 29_000 && custom.durationMs <= 32_000);
  assert.notEqual(custom.bytes[4], firstMarker, "custom window is not the file start");
  assert.ok(
    custom.bytes.byteLength < bytes.byteLength / 2,
    "45-75s is not the rest of the file",
  );

  const early = extractMp3TimeRange(bytes, 0, 45_000);
  assert.notDeepEqual(
    Buffer.from(custom.bytes.subarray(0, 16)),
    Buffer.from(early.bytes.subarray(0, 16)),
    "45-75s clip is not the 0-45s prefix",
  );

  const fallback = extractMp3TimeRange(bytes, 0, 60_000);
  assert.ok(fallback.durationMs >= 59_000 && fallback.durationMs <= 62_000);

  const late = extractMp3TimeRange(bytes, 75_000, 90_000);
  assert.notDeepEqual(
    Buffer.from(custom.bytes.subarray(0, 16)),
    Buffer.from(late.bytes.subarray(0, 16)),
    "clip does not include audio after 75s",
  );

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunkSize = 2048;
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      }
      controller.close();
    },
  });

  return extractMp3TimeRangeFromStream(stream, 45_000, 75_000).then((streamed) => {
    assert.equal(streamed.bytes.byteLength, custom.bytes.byteLength);
    assert.ok(frameDurationMs > 20 && frameDurationMs < 30);
  });
}

function readFirstFrameOffset(bytes: Uint8Array): number {
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    if (peekMp3FrameLayout(bytes, offset)) {
      return offset;
    }
  }

  throw new Error("no frame");
}

function testRangeAndUrlGuards() {
  const clip = new Uint8Array(1000).fill(7);
  const spoof = parseHttpByteRange("bytes=0-99999", clip.byteLength);
  assert.equal(spoof?.end, 999);
  const sliced = sliceBytesForRange(clip, "bytes=0-99999");
  assert.equal(sliced.body.byteLength, 1000);
  assert.equal(sliced.status, 206);

  const suffix = sliceBytesForRange(clip, "bytes=900-");
  assert.equal(suffix.body.byteLength, 100);
  assert.notEqual(suffix.body.byteLength, 5000);

  const clipPath = buildListenPreviewClipPath(
    "/api/listen/product/author/paid-track",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  assert.equal(
    clipPath,
    "/api/listen/product/author/paid-track/audio/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/clip",
  );
  assert.equal(isListenPreviewClipPath(clipPath), true);
  assert.equal(
    isOriginalPracticeAudioSignedUrl(
      "https://audiolad.ru/storage/v1/object/sign/practice-audio/practices/1/audio.mp3?token=abc",
    ),
    true,
  );
  assert.equal(isOriginalPracticeAudioSignedUrl(clipPath), false);

  const timeline = resolvePreviewClipMediaTimeline({
    previewStartMs: 45_000,
    previewEndMs: 75_000,
  });
  assert.equal(timeline.mediaStartSeconds, 0);
  assert.equal(timeline.mediaEndSeconds, 30);
  assert.equal(timeline.displayDurationSeconds, 30);
}

function testSourceContracts() {
  const signedAudio = read("src/lib/listen/signed-audio.ts");
  const apiContext = read("src/lib/listen/api-context.ts");
  const progress = read(
    "src/app/api/listen/product/[slug]/[productSlug]/progress/route.ts",
  );
  const legacyProgress = read(
    "src/app/api/listen/legacy/[slug]/progress/route.ts",
  );
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const fetchUrl = read("src/lib/audio/signed-audio-url.ts");

  assert.match(signedAudio, /preview_clip:\s*true/);
  assert.match(signedAudio, /buildListenPreviewClipPath/);
  const catalogPreviewBlock = signedAudio.slice(
    signedAudio.indexOf('access.mode === "catalog_preview"'),
    signedAudio.indexOf('access.mode === "entitled"'),
  );
  assert.match(catalogPreviewBlock, /preview_clip:\s*true/);
  assert.doesNotMatch(catalogPreviewBlock, /createSignedUrl/);
  assert.match(apiContext, /purpose \?\? "full_audio"/);
  assert.match(progress, /purpose:\s*"progress"/);
  assert.match(progress, /canWritePracticeProgress/);
  assert.match(legacyProgress, /purpose:\s*"progress"/);
  assert.match(legacyProgress, /canWritePracticeProgress/);
  assert.match(player, /resolvePreviewClipMediaTimeline/);
  assert.match(player, /isPreviewModeRef\.current/);
  assert.match(fetchUrl, /preview_full_audio_blocked/);

  assert.equal(
    existsSync(
      join(
        root,
        "src/app/api/listen/product/[slug]/[productSlug]/audio/[audioId]/clip/route.ts",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(root, "src/app/api/listen/legacy/[slug]/audio/[audioId]/clip/route.ts"),
    ),
    true,
  );

  const catalogPlay = read("src/lib/catalog/catalog-playback.ts");
  assert.match(catalogPlay, /playbackMode: "preview"/);
  const playlistPreview = read("scripts/playlist-paid-storefront-preview-unit.mts");
  assert.match(playlistPreview, /shouldFallbackListenSessionToCatalogPreview/);
}

await testMp3ClipSecurity();
testAccessDecisions();
testPreviewWindows();
testRangeAndUrlGuards();
testSourceContracts();

console.log("preview-audio-security-unit: ok");
