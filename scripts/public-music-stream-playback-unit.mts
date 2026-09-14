import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MUSIC_STREAMS_BUCKET } from "../src/lib/author-products/music-master-upload-contract";
import {
  hasProductPlayableAudio,
  hasPublicTrackPlayableAudio,
  resolveMusicListenSource,
} from "../src/lib/listen/music-delivery";
import {
  buildPracticeAccessPresentation,
  hasAudioReady,
} from "../src/lib/products/practice-access-ui";
import type { ProductAccessResult } from "../src/lib/products/access";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const freeAccess: ProductAccessResult = {
  canListen: true,
  canAcquire: false,
  isPubliclyListed: true,
  reason: "free",
  isAuthorMember: false,
  accessSource: null,
  hasEntitlement: false,
  accessLevel: null,
};

function basePractice(overrides: Record<string, unknown> = {}) {
  return {
    id: "practice-1",
    slug: "jazz-rest",
    audio_url: null as string | null,
    price: 0,
    is_free: true,
    format: "музыка",
    status: "published",
    is_catalog_listed: true,
    catalog_visibility: "public",
    author_id: "author-1",
    ...overrides,
  };
}

function present(input: {
  audio_url?: string | null;
  hasPlayableAudio?: boolean;
}) {
  return buildPracticeAccessPresentation({
    access: freeAccess,
    practice: basePractice({ audio_url: input.audio_url ?? null }),
    authorSlug: "author",
    paymentsConfigured: true,
    isAuthenticated: true,
    hasPlayableAudio: input.hasPlayableAudio,
  });
}

// A. legacy practices.audio_url → listen
{
  const p = present({ audio_url: "authors/a/track.mp3" });
  assert.equal(p.primaryAction.kind, "listen");
  assert.equal(hasAudioReady("authors/a/track.mp3"), true);
}

// B. direct MP3 audio_path → listen via track flag
{
  assert.equal(
    hasPublicTrackPlayableAudio({ audioPath: "authors/a/direct.mp3", hasActiveDelivery: false }),
    true,
  );
  const product = hasProductPlayableAudio({
    practiceAudioUrl: null,
    tracksHavePlayableAudio: true,
  });
  assert.equal(product, true);
  assert.equal(present({ hasPlayableAudio: product }).primaryAction.kind, "listen");
}

// C. published music + audio_path NULL + validated active delivery → listen
{
  assert.equal(
    hasPublicTrackPlayableAudio({ audioPath: null, hasActiveDelivery: true }),
    true,
  );
  const product = hasProductPlayableAudio({
    practiceAudioUrl: null,
    tracksHavePlayableAudio: true,
  });
  assert.equal(present({ audio_url: null, hasPlayableAudio: product }).primaryAction.kind, "listen");
}

// D. music + no path + no active delivery → audio_pending
{
  assert.equal(
    hasPublicTrackPlayableAudio({ audioPath: null, hasActiveDelivery: false }),
    false,
  );
  assert.equal(
    hasPublicTrackPlayableAudio({ audioPath: "  ", hasActiveDelivery: false }),
    false,
  );
  const product = hasProductPlayableAudio({
    practiceAudioUrl: null,
    tracksHavePlayableAudio: false,
  });
  const p = present({ audio_url: null, hasPlayableAudio: product });
  assert.equal(p.primaryAction.kind, "audio_pending");
  assert.match(
    p.primaryAction.kind === "audio_pending" ? p.primaryAction.label : "",
    /Аудио скоро появится/,
  );
}

// E. replacement processing + old active delivery present → listen
{
  // Presentation only sees validated hasActiveDelivery=true for the old stream.
  const product = hasProductPlayableAudio({
    practiceAudioUrl: null,
    tracksHavePlayableAudio: hasPublicTrackPlayableAudio({
      audioPath: null,
      hasActiveDelivery: true,
    }),
  });
  assert.equal(present({ hasPlayableAudio: product }).primaryAction.kind, "listen");
}

// F. several WAV-derived tracks → product CTA listen (track list gated by same primaryAction)
{
  const flags = [true, true, true];
  const product = hasProductPlayableAudio({
    practiceAudioUrl: null,
    tracksHavePlayableAudio: flags.some(Boolean),
  });
  const p = present({ hasPlayableAudio: product });
  assert.equal(p.primaryAction.kind, "listen");
  // ProductContentsSection uses presentation.primaryAction.kind === "listen"
  assert.equal(p.primaryAction.kind === "listen", true);
}

// G. no audio → pending
{
  const p = present({ audio_url: null, hasPlayableAudio: false });
  assert.equal(p.primaryAction.kind, "audio_pending");
}

// H. master path is never a listen source; stream resolver stays canonical
{
  const masterAsPath = resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: null,
    activeStream: {
      audioItemId: "item-1",
      assetRole: "master",
      lifecycleState: "verified",
      storageBucket: "music-masters",
      storagePath: "masters/secret.wav",
    },
  });
  assert.equal(masterAsPath.kind, "missing");

  const stream = resolveMusicListenSource({
    productKind: "music",
    audioItemId: "item-1",
    audioPath: null,
    activeStream: {
      audioItemId: "item-1",
      assetRole: "stream",
      lifecycleState: "verified",
      storageBucket: MUSIC_STREAMS_BUCKET,
      storagePath: "streams/ready.mp3",
    },
  });
  assert.equal(stream.kind, "stream");
  assert.equal(stream.kind === "stream" ? stream.bucket : "", MUSIC_STREAMS_BUCKET);
  assert.notEqual(stream.kind === "stream" ? stream.bucket : "", "music-masters");
}

// Bare activeMusicDeliveryAssetId must not be treated as playable without validated flag
{
  // mirrors hasPlayableAuthorAudioPreview / hasValidatedMusicPublishSource
  assert.equal(
    hasPublicTrackPlayableAudio({
      audioPath: null,
      hasActiveDelivery: false,
    }),
    false,
  );
}

// Source wiring assertions
{
  const page = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
  const accessUi = read("src/lib/products/practice-access-ui.ts");
  const publicItems = read("src/lib/products/public-audio-items.ts");
  const contents = read("src/components/products/practice-page/PracticePageContent.tsx");

  assert.match(page, /hasProductPlayableAudio/);
  assert.match(page, /hasPlayableAudio/);
  assert.match(accessUi, /hasPlayableAudio\?:/);
  assert.match(publicItems, /hasPlayableAudio/);
  assert.match(publicItems, /active_music_delivery_asset_id/);
  assert.match(publicItems, /isVerifiedMusicStreamAsset/);
  assert.match(publicItems, /hasPublicTrackPlayableAudio/);
  assert.doesNotMatch(publicItems, /music-masters/);
  // Do not leak private paths into PublicAudioItem type fields
  const typeBlock = publicItems.slice(
    publicItems.indexOf("export type PublicAudioItem"),
    publicItems.indexOf("};", publicItems.indexOf("export type PublicAudioItem")) + 2,
  );
  assert.match(typeBlock, /hasPlayableAudio/);
  assert.doesNotMatch(typeBlock, /audioPath|audio_path|activeMusic|storagePath|storage_path/);

assert.match(contents, /presentation\.primaryAction\.kind === \"listen\"/);
  // No second playback pipeline / no writing stream path into practices.audio_url
  assert.doesNotMatch(accessUi, /music-streams/);
  assert.doesNotMatch(page, /practices\.audio_url\s*=/);
}

console.log("public-music-stream-playback-unit: ok");
