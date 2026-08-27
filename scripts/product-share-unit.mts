import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION_APP_ORIGIN, getAppOrigin } from "../src/lib/seo/app-origin";
import {
  PRODUCT_SHARE_COPIED_TOAST,
  PRODUCT_SHARE_FAILED_TOAST,
  buildProductSharePayload,
  buildProductShareUrl,
  shareProductPage,
  toastForShareResult,
} from "../src/lib/products/share";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_ORIGIN;

function testShareUrlUsesAppOriginAndPublicPath() {
  const path = "/practice/anna/morning-practice";
  assert.equal(buildProductShareUrl(path), `${getAppOrigin()}${path}`);
  assert.equal(
    buildProductShareUrl(path),
    "https://audiolad.ru/practice/anna/morning-practice",
  );
  assert.equal(
    buildProductShareUrl("/practice/anna/morning-practice?preview=publish#hero"),
    `${getAppOrigin()}/practice/anna/morning-practice`,
  );
  assert.match(read("src/lib/products/share.ts"), /getAppOrigin/);
  assert.match(read("src/lib/products/paths.ts"), /getAppOrigin/);
}

function testShareUrlRejectsListenAndPrivatePaths() {
  const rejected = [
    "/listen/anna/morning-practice",
    "/listen",
    "/listens/taro-dengi",
    "/practice/anna/listen",
    "/profile",
    "/profile/edit",
    "/admin",
    "/admin/sales",
    "/author-dashboard",
    "/auth/sign-in",
    "/my-practices",
    "/checkout",
    "/api/listen/product/anna/morning-practice",
    "https://audiolad.ru/practice/anna/morning-practice",
    "//audiolad.ru/practice/anna/morning-practice",
  ];

  for (const path of rejected) {
    assert.equal(buildProductShareUrl(path), null, path);
  }
}

function testSharePayloadUsesSubtitleOnly() {
  const payload = buildProductSharePayload({
    title: "  Утренняя практика  ",
    path: "/practice/anna/morning-practice",
    subtitle: "  Короткий <b>анонс</b>  ",
  });

  assert.deepEqual(payload, {
    title: "Утренняя практика",
    text: "Короткий анонс",
    url: `${getAppOrigin()}/practice/anna/morning-practice`,
  });

  assert.deepEqual(
    buildProductSharePayload({
      title: "Утренняя практика",
      path: "/practice/anna/morning-practice",
      subtitle: "   ",
    }),
    {
      title: "Утренняя практика",
      url: `${getAppOrigin()}/practice/anna/morning-practice`,
    },
  );

  assert.equal(
    buildProductSharePayload({
      title: "Утренняя практика",
      path: "/listen/anna/morning-practice",
      subtitle: "анонс",
    }),
    null,
  );
}

async function testWebShareWhenAvailable() {
  const payload = {
    title: "Утренняя практика",
    text: "Короткий анонс",
    url: `${getAppOrigin()}/practice/anna/morning-practice`,
  };
  const calls: unknown[] = [];

  const result = await shareProductPage(payload, {
    share: async (data) => {
      calls.push(data);
    },
  });

  assert.equal(result, "shared");
  assert.deepEqual(calls, [payload]);
}

async function testWebShareHonorsCanShare() {
  const payload = {
    title: "Утренняя практика",
    url: `${getAppOrigin()}/practice/anna/morning-practice`,
  };
  let shared = false;
  let copied = "";

  const accepted = await shareProductPage(payload, {
    canShare: () => true,
    share: async () => {
      shared = true;
    },
    writeText: async (text) => {
      copied = text;
    },
  });
  assert.equal(accepted, "shared");
  assert.equal(shared, true);
  assert.equal(copied, "");

  shared = false;
  const rejected = await shareProductPage(payload, {
    canShare: () => false,
    share: async () => {
      shared = true;
    },
    writeText: async (text) => {
      copied = text;
    },
  });
  assert.equal(rejected, "copied");
  assert.equal(shared, false);
  assert.equal(copied, payload.url);
}

async function testAbortErrorIsIgnored() {
  const payload = {
    title: "Утренняя практика",
    url: `${getAppOrigin()}/practice/anna/morning-practice`,
  };
  let copied = false;

  const result = await shareProductPage(payload, {
    share: async () => {
      const error = new Error("dismissed");
      error.name = "AbortError";
      throw error;
    },
    writeText: async () => {
      copied = true;
    },
  });

  assert.equal(result, "aborted");
  assert.equal(copied, false);
  assert.equal(toastForShareResult("aborted"), null);
}

async function testClipboardFallbackAndExactToast() {
  const payload = {
    title: "Утренняя практика",
    url: `${getAppOrigin()}/practice/anna/morning-practice`,
  };
  let copied = "";

  const copiedResult = await shareProductPage(payload, {
    writeText: async (text) => {
      copied = text;
    },
  });

  assert.equal(copiedResult, "copied");
  assert.equal(copied, payload.url);
  assert.equal(PRODUCT_SHARE_COPIED_TOAST, "Ссылка скопирована");
  assert.equal(toastForShareResult("copied"), "Ссылка скопирована");

  const failed = await shareProductPage(payload, {
    writeText: async () => {
      throw new Error("denied");
    },
  });
  assert.equal(failed, "failed");
  assert.equal(toastForShareResult("failed"), PRODUCT_SHARE_FAILED_TOAST);

  const missing = await shareProductPage(payload, {});
  assert.equal(missing, "failed");
}

function testPdpWiresShareNextToHeart() {
  const gallery = read(
    "src/components/products/practice-page/PracticeHeroGallery.tsx",
  );
  const hero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  const shareButton = read(
    "src/components/products/practice-page/PracticeProductShareButton.tsx",
  );
  const heart = read("src/components/products/CatalogProductHeartButton.tsx");

  assert.match(hero, /shareTitle=\{viewModel\.practice\.title\}/);
  assert.match(hero, /sharePath=\{viewModel\.practicePagePath\}/);
  assert.match(hero, /shareSubtitle=\{viewModel\.subtitle\}/);
  assert.match(gallery, /PracticeProductShareButton/);
  assert.match(gallery, /data-practice-hero-cover-actions/);
  assert.match(gallery, /className="absolute top-2 right-2 z-10 flex items-center gap-1\.5"/);
  assert.match(gallery, /className="relative"/);
  assert.doesNotMatch(gallery, /Telegram|VK|MAX|telegram|vk\.com/);
  assert.match(shareButton, /aria-label="Поделиться"/);
  assert.match(shareButton, /navigator\.share/);
  assert.match(shareButton, /clipboard/);
  assert.match(shareButton, /PRODUCT_SHARE_COPIED_TOAST|toastForShareResult/);
  assert.doesNotMatch(shareButton, /personal-materials\/client\/clipboard/);
  assert.match(heart, /className = "absolute top-2 right-2 z-10"/);
}

testShareUrlUsesAppOriginAndPublicPath();
testShareUrlRejectsListenAndPrivatePaths();
testSharePayloadUsesSubtitleOnly();
await testWebShareWhenAvailable();
await testWebShareHonorsCanShare();
await testAbortErrorIsIgnored();
await testClipboardFallbackAndExactToast();
testPdpWiresShareNextToHeart();

console.log("product-share-unit: ok");
