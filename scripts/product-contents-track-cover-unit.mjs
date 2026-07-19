#!/usr/bin/env node
/**
 * Product contents track cover + playback unit checks (no DB).
 */
import { readFileSync } from "node:fs";

import {
  resolvePlaybackCoverFields,
  resolvePlaybackCoverUrl,
} from "../src/lib/products/cover-display.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const contentsSection = readFileSync(
  "src/components/products/ProductContentsSection.tsx",
  "utf8",
);
const interactiveList = readFileSync(
  "src/components/products/ProductContentsInteractiveList.tsx",
  "utf8",
);
const playbackHook = readFileSync(
  "src/components/products/useProductContentsPlayback.ts",
  "utf8",
);
const trackCover = readFileSync(
  "src/components/products/ProductContentsTrackCover.tsx",
  "utf8",
);
const publicAudioItems = readFileSync(
  "src/lib/products/public-audio-items.ts",
  "utf8",
);
const practicePage = readFileSync(
  "src/app/(listener)/practice/[...segments]/page.tsx",
  "utf8",
);
const practiceMobilePage = readFileSync(
  "src/components/products/practice-page/PracticePageMobile.tsx",
  "utf8",
);
const globalPlayerTypes = readFileSync(
  "src/lib/listen/global-player-types.ts",
  "utf8",
);
const sequentialPlayer = readFileSync(
  "src/components/audio/useSequentialPlayer.ts",
  "utf8",
);
const globalProvider = readFileSync(
  "src/components/audio/GlobalAudioPlayerProvider.tsx",
  "utf8",
);

assert(
  publicAudioItems.includes("cover_url, cover_image, updated_at"),
  "public audio loader selects track cover fields",
);
assert(
  publicAudioItems.includes("coverUrl:") && publicAudioItems.includes("coverImage:"),
  "PublicAudioItem exposes track cover fields",
);

assert(
  contentsSection.includes("ProductContentsInteractiveList"),
  "contents section delegates interactive list to client component",
);
assert(
  !contentsSection.includes('"use client"'),
  "contents section remains a server component",
);

assert(
  interactiveList.includes("ProductContentsTrackCover"),
  "interactive list renders track cover component",
);
assert(
  interactiveList.includes("resolvePlaybackCoverUrl"),
  "interactive list uses shared playback cover resolver",
);
assert(
  interactiveList.includes("resolvePlaybackCoverFields"),
  "interactive list resolves manifest fields for track cover",
);
assert(
  interactiveList.includes("object-cover") || trackCover.includes("object-cover"),
  "track cover uses object-cover",
);
assert(
  trackCover.includes("size-[76px]") && trackCover.includes("md:size-[96px]"),
  "track cover has mobile and desktop sizes",
);
assert(
  trackCover.includes("onError") && trackCover.includes("return null"),
  "broken track cover is hidden",
);
assert(
  interactiveList.includes("{index + 1}."),
  "track numbering preserved in title row",
);
assert(
  interactiveList.includes("formatAudioDuration"),
  "track duration formatting preserved",
);
assert(
  interactiveList.includes("FormattedPlainText"),
  "track description rendering preserved",
);
assert(
  /className="mt-2 text-sm leading-6 text-\[#7d70a2\]"/.test(interactiveList),
  "description spans full card width below header row",
);

assert(
  interactiveList.includes('type="button"'),
  "track card uses semantic button",
);
assert(
  interactiveList.includes("aria-label={`Слушать: ${item.title}`}"),
  "track card has listen aria-label",
);
assert(
  interactiveList.includes("playTrack(item.id)"),
  "click handler passes selected track id",
);
assert(
  interactiveList.includes("cursor-pointer"),
  "enabled cards show pointer cursor",
);

assert(
  playbackHook.includes("fetchListenSessionPayload"),
  "playback hook reuses listen session endpoint",
);
assert(
  playbackHook.includes("loadSession({"),
  "playback hook loads global player session",
);
assert(
  playbackHook.includes("initialTrackId: trackId"),
  "selected track id is passed into player session",
);
assert(
  playbackHook.includes("suppressListenUrlSync: true"),
  "product page playback keeps current route",
);
assert(
  playbackHook.includes("handlePlayTrackAtIndex"),
  "same-product clicks reuse engine track switch",
);
assert(
  playbackHook.includes("requestLockRef"),
  "duplicate rapid clicks are guarded",
);
assert(
  playbackHook.includes("clearPlaylistQueue"),
  "product playback clears playlist queue",
);

assert(
  practicePage.includes("PracticePageViewModel"),
  "practice page builds a shared view model for mobile and desktop",
);
assert(
  practiceMobilePage.includes("ProductContentsSection"),
  "practice mobile view wires contents section from shared view model",
);
assert(
  practiceMobilePage.includes("practiceCover={{"),
  "practice page passes practice cover context to contents section",
);
assert(
  practiceMobilePage.includes("use_shared_cover"),
  "practice page passes use_shared_cover for per-track fallback",
);
assert(
  practiceMobilePage.includes('enabled: presentation.primaryAction.kind === "listen"'),
  "playback enabled only when listen action is available",
);

assert(
  globalPlayerTypes.includes("initialTrackId"),
  "player session supports initial track selection",
);
assert(
  globalPlayerTypes.includes("suppressListenUrlSync"),
  "player session supports staying on product page",
);
assert(
  sequentialPlayer.includes("initialTrackId"),
  "sequential player honors initial track id",
);
assert(
  sequentialPlayer.includes("handlePlayTrackAtIndex"),
  "sequential player exposes explicit track play helper",
);
assert(
  globalProvider.includes("session.suppressListenUrlSync"),
  "provider skips listen redirect for product page playback",
);
assert(
  globalProvider.includes("input.initialTrackId !== current.initialTrackId"),
  "provider remounts engine when selected track changes",
);

const practice = {
  cover_url: "https://cdn.test/product.png",
  cover_image: null,
  updated_at: "2026-01-01T00:00:00Z",
  use_shared_cover: false,
};

const trackWithCover = {
  cover_url: "https://cdn.test/track-a.png",
  cover_image: null,
  updated_at: "2026-01-02T00:00:00Z",
};

const trackWithoutCover = {
  cover_url: null,
  cover_image: null,
  updated_at: null,
};

const individualUrl = resolvePlaybackCoverUrl(practice, trackWithCover, 96);
assert(
  individualUrl?.includes("track-a.png"),
  "individual track cover takes priority when shared cover disabled",
);

const fallbackUrl = resolvePlaybackCoverUrl(practice, trackWithoutCover, 96);
assert(
  fallbackUrl?.includes("product.png"),
  "product cover is used when track cover is missing",
);

const sharedPractice = {
  ...practice,
  use_shared_cover: true,
};

const sharedUrl = resolvePlaybackCoverUrl(sharedPractice, trackWithCover, 96);
assert(
  sharedUrl?.includes("product.png"),
  "shared cover mode keeps product cover in resolver",
);

const fields = resolvePlaybackCoverFields(practice, trackWithCover);
assert(
  fields.coverUrl?.includes("track-a.png"),
  "cover fields resolver prefers individual track cover",
);

console.log("product-contents-track-cover-unit: ok");
