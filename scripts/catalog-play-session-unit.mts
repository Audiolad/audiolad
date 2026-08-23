import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyCatalogPlayContract,
  resolveCatalogPlaybackMode,
} from "../src/lib/catalog/catalog-playback-contract";
import { parsePracticePublicPath } from "../src/lib/products/paths";
import type { CatalogGlobalPlayerSession } from "../src/lib/listen/global-player-types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function baseSession(): CatalogGlobalPlayerSession {
  return {
    practiceId: "practice-1",
    authorSlug: "zoya-petrova",
    productSlug: "zhenskie-dengi",
    practiceTitle: "Женские деньги",
    authorName: "Зоя Петрова",
    format: "Практика",
    tracks: [
      {
        id: "track-1",
        title: "Часть 1",
        description: null,
        position: 1,
        durationSeconds: 180,
        coverImageUrl: null,
      },
    ],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    coverImageUrl: null,
    isAuthorPreview: false,
  };
}

function testPlaybackModeResolution() {
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: true, accessState: "free" }),
    "full",
  );
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: false, accessState: "free" }),
    "full",
  );
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: true, accessState: "paid" }),
    "full",
  );
  assert.equal(
    resolveCatalogPlaybackMode({ canListen: false, accessState: "paid" }),
    "preview",
  );
}

function testCatalogPlayContract() {
  const session = applyCatalogPlayContract(baseSession());

  assert.equal(session.sourceType, "catalog");
  assert.equal(session.entrySurface, "catalog");
  assert.equal(session.playbackMode, "full");
  assert.equal(session.suppressListenUrlSync, true);
  assert.equal(session.forceStartAtBeginning, true);
  assert.equal(session.requestAutoplay, true);

  const preview = applyCatalogPlayContract(baseSession(), {
    playbackMode: "preview",
    previewStartMs: 15_000,
    previewEndMs: 75_000,
    previewCta: {
      type: "buy",
      price: 1490,
      href: "/practice/zoya-petrova/zhenskie-dengi",
    },
  });

  assert.equal(preview.entrySurface, "catalog");
  assert.equal(preview.playbackMode, "preview");
  assert.equal(preview.previewStartMs, 15_000);
  assert.equal(preview.previewEndMs, 75_000);
  assert.equal(preview.previewCta?.type, "buy");
}

function testPracticePathParse() {
  assert.deepEqual(parsePracticePublicPath("/practice/zoya-petrova/zhenskie-dengi"), {
    authorSlug: "zoya-petrova",
    productSlug: "zhenskie-dengi",
  });
  assert.equal(parsePracticePublicPath("/listen/zoya-petrova/zhenskie-dengi"), null);
  assert.equal(parsePracticePublicPath("/catalog"), null);
}

function testSourceTypeUnchanged() {
  const types = read("src/lib/listen/global-player-types.ts");
  assert.match(types, /export type GlobalPlayerSourceType = "catalog" \| "private_audio"/);
  assert.doesNotMatch(types, /sourceType:\s*"saved"/);
}

function testListingApiUnchanged() {
  const listingApi = read("src/app/api/catalog/route.ts");
  assert.match(listingApi, /listPublishedCatalog/);
  assert.doesNotMatch(listingApi, /loadCatalogPlaySession/);
  assert.doesNotMatch(listingApi, /entrySurface/);
}

testPlaybackModeResolution();
testCatalogPlayContract();
testPracticePathParse();
testSourceTypeUnchanged();
testListingApiUnchanged();

console.log("catalog-play-session-unit: ok");
