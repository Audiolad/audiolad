#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import {
  buildAudioPostListenRedirectPath,
  isInlineOnlyPlaybackSession,
  resolvePlaybackNavigationPolicy,
} from "../src/lib/listen/playback-navigation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(
  resolvePlaybackNavigationPolicy(PRODUCT_KIND.AUDIO_POST),
  "inline_only",
);
assert.equal(
  resolvePlaybackNavigationPolicy(PRODUCT_KIND.PRACTICE),
  "fullscreen",
);
assert.equal(resolvePlaybackNavigationPolicy(PRODUCT_KIND.MUSIC), "fullscreen");
assert.equal(resolvePlaybackNavigationPolicy(null), "fullscreen");

assert.equal(
  isInlineOnlyPlaybackSession({
    practiceId: "p1",
    authorSlug: "a",
    productSlug: "s",
    practiceTitle: "t",
    authorName: "n",
    format: null,
    tracks: [],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-a",
    coverImageUrl: null,
    isAuthorPreview: false,
    playbackNavigation: "inline_only",
  }),
  true,
);

assert.equal(
  isInlineOnlyPlaybackSession({
    practiceId: "p1",
    authorSlug: "a",
    productSlug: "s",
    practiceTitle: "t",
    authorName: "n",
    format: null,
    tracks: [],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-a",
    coverImageUrl: null,
    isAuthorPreview: false,
    playbackNavigation: "fullscreen",
  }),
  false,
);

assert.equal(
  isInlineOnlyPlaybackSession({
    sourceType: "private_audio",
    itemId: "i1",
    detailPath: "/personal/x",
    authorText: null,
    practiceTitle: "t",
    authorName: "n",
    format: null,
    tracks: [],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-a",
    coverImageUrl: null,
    isAuthorPreview: false,
  }),
  false,
);

assert.equal(
  buildAudioPostListenRedirectPath("sergey-petrov", "priglashenie"),
  "/practice/sergey-petrov/priglashenie",
);

assert.equal(
  buildAudioPostListenRedirectPath("sergey-petrov", "priglashenie", {
    utm_source: "telegram",
    utm_medium: "social",
    autoplay: "1",
    access: "denied",
    campaign: "school",
  }),
  "/practice/sergey-petrov/priglashenie?utm_source=telegram&utm_medium=social&campaign=school",
);

assert.equal(
  buildAudioPostListenRedirectPath(
    "sergey-petrov",
    "priglashenie",
    new URLSearchParams("utm_campaign=q&autoplay=1"),
  ),
  "/practice/sergey-petrov/priglashenie?utm_campaign=q",
);

const sessionLoader = read("src/lib/listen/load-session-payload.ts");
assert.match(sessionLoader, /resolvePlaybackNavigationPolicy/);
assert.match(sessionLoader, /playbackNavigation/);
assert.match(sessionLoader, /suppressListenUrlSync:\s*playbackNavigation === "inline_only"/);

const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
assert.match(
  provider,
  /playbackNavigation === "inline_only"/,
  "openFullPlayer must no-op for audio_post",
);

const miniPlayer = read("src/components/audio/GlobalMiniPlayer.tsx");
assert.match(miniPlayer, /isInlineOnlyPlaybackSession/);
assert.match(miniPlayer, /const inlineOnly = isInlineOnlyPlaybackSession/);
assert.match(
  miniPlayer,
  /inlineOnly \? \(\s*<div className="flex min-w-0 flex-1/,
  "mini-player body must be non-navigating for audio_post",
);

const desktopBar = read("src/components/listener/DesktopPlayerBar.tsx");
assert.match(desktopBar, /isInlineOnlyPlaybackSession/);
assert.match(desktopBar, /inlineOnly \? null/);

const listenPage = read("src/app/(platform)/listen/[...segments]/page.tsx");
assert.match(listenPage, /searchParams:\s*query/);

const pageShared = read("src/lib/listen/page-shared.tsx");
assert.match(pageShared, /isAudioPostProductKind/);
assert.match(pageShared, /buildAudioPostListenRedirectPath/);
assert.match(pageShared, /redirect\(/);

const audioPostPage = read(
  "src/components/products/audio-post/AudioPostPage.tsx",
);
assert.match(audioPostPage, /xl:hidden/);
assert.match(audioPostPage, /hidden xl:block/);
assert.match(audioPostPage, /featured-card/);
assert.match(audioPostPage, /variant="embedded"/);
assert.match(audioPostPage, /variant="panel"/);
assert.match(audioPostPage, /data-testid="audio-post-recommendation"/);
assert.match(audioPostPage, /AudioPostBackLink/);
assert.doesNotMatch(audioPostPage, /Воспроизведение откроется в плеере/);
assert.doesNotMatch(audioPostPage, /\/listen\//);
assert.doesNotMatch(audioPostPage, /Подробнее/);

const audioPostPlayer = read(
  "src/components/products/audio-post/AudioPostPlayer.tsx",
);
assert.match(audioPostPlayer, /variant\?: "embedded" \| "panel"/);
assert.match(audioPostPlayer, /useProductContentsPlayback/);
assert.match(audioPostPlayer, /"Пауза"/);
assert.match(audioPostPlayer, /"Слушать"/);
assert.doesNotMatch(audioPostPlayer, /Воспроизведение откроется в плеере/);
assert.doesNotMatch(audioPostPlayer, /\/listen\//);

const backLink = read(
  "src/components/products/audio-post/AudioPostBackLink.tsx",
);
assert.match(backLink, /← Назад/);
assert.match(backLink, /router\.back/);
assert.match(backLink, /router\.push\("\/"\)/);
assert.doesNotMatch(backLink, /\/catalog/);

console.log("audio-post-inline-playback-unit: ok");
