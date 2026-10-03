import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildProductStartPayload,
  parseProductStartPayload,
} from "../src/lib/mini-app/product-target.ts";
import {
  initVkBridge,
  openVkExternalHttps,
  resetVkBridgeInitForTests,
  VK_BRIDGE_INIT_METHOD,
} from "../src/lib/vk/bridge.ts";
import {
  buildVkFrameAncestorsPolicy,
  parseVkLaunchToken,
  readVkLaunchTarget,
  VK_OFFICIAL_FRAME_ANCESTORS,
  VK_SMOKE_AUTHOR_SLUG,
  VK_SMOKE_PRODUCT_SLUG,
  VK_SMOKE_TOKEN,
} from "../src/lib/vk/launch-target.ts";
import {
  POST as postProduct,
  setGetMaxPublishedProductForTests,
  setPublishedProductLookupForTests,
} from "../src/app/api/vk/product/route.ts";
import {
  POST as postAudio,
  setVkPlaybackDepsForTests,
} from "../src/app/api/vk/playback/audio/route.ts";
import { POST as postSession } from "../src/app/api/vk/playback/session/route.ts";
import { POST as postHome, setListMaxPublishedCatalogForTests } from "../src/app/api/vk/home/route.ts";
import { POST as postCatalog } from "../src/app/api/vk/catalog/route.ts";
import { POST as postTopics, setListMaxCatalogTopicsForTests } from "../src/app/api/vk/catalog/topics/route.ts";
import { POST as postPlaylistCatalog, setListMaxPublicPlaylistsForTests } from "../src/app/api/vk/playlists/catalog/route.ts";
import { POST as postPlaylistDetail, setLoadMaxPublicPlaylistForTests } from "../src/app/api/vk/playlists/detail/route.ts";
import {
  VK_GUEST_LOGIN_LABEL,
  VK_GUEST_SIGNUP_LABEL,
  VK_LIBRARY_GUEST_MESSAGE,
  VK_PROFILE_GUEST_STATUS,
} from "../src/lib/vk/guest-copy.ts";
import { readVkProductRef } from "../src/lib/vk/request.ts";
import {
  resolveVkShellLaunch,
  vkDetailBackTarget,
  vkTabSelectionAfterSelect,
} from "../src/lib/vk/shell.ts";
import { SEO_ROBOTS_DISALLOWED_PATHS } from "../src/lib/seo/robots-config.ts";
import nextConfigModule from "../next.config.ts";

const practiceId = "11111111-1111-4111-8111-111111111111";
const payload = "p_11111111111141118111111111111111";
const trackId = "33333333-3333-4333-8333-333333333333";

assert.equal(buildProductStartPayload(practiceId), payload);
assert.deepEqual(parseProductStartPayload(payload), { practiceId });
assert.equal(parseProductStartPayload("g_22222222222242228222222222222222"), null);
assert.equal(parseProductStartPayload("p_bad"), null);
assert.equal(parseProductStartPayload("aurafon/muzyka-dlya-krepkogo-sna"), null);
assert.equal(parseVkLaunchToken("not-a-target"), null);
assert.deepEqual(parseVkLaunchToken(VK_SMOKE_TOKEN), { kind: "smoke" });
assert.deepEqual(readVkLaunchTarget({
  search: `?vk_app_id=54802101&vk_user_id=1&sign=abc&hash=${payload}`,
}), { kind: "product", payload });
assert.deepEqual(readVkLaunchTarget({ hash: `#${payload}` }), { kind: "product", payload });
assert.deepEqual(readVkLaunchTarget({ hash: "#smoke" }), { kind: "smoke" });
assert.deepEqual(readVkLaunchTarget({ search: "?start=smoke" }), { kind: "smoke" });
assert.equal(readVkLaunchTarget({
  search: "?hash=aurafon/muzyka-dlya-krepkogo-sna",
}), null);
assert.equal(readVkLaunchTarget({ hash: "#g_22222222222242228222222222222222" }), null);
assert.equal(readVkLaunchTarget({}), null);

assert.equal(
  buildVkFrameAncestorsPolicy(),
  "frame-ancestors 'self' https://vk.com https://m.vk.com https://vk.ru https://m.vk.ru",
);
assert.equal(VK_OFFICIAL_FRAME_ANCESTORS.includes("https://ok.ru"), false);
assert.equal(buildVkFrameAncestorsPolicy().includes("*"), false);

const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
assert.match(nextConfig, /source: "\/vk"/);
assert.match(nextConfig, /buildVkFrameAncestorsPolicy\(\)/);
assert.doesNotMatch(nextConfig, /X-Frame-Options/);
assert.equal(nextConfig.split("frame-ancestors").length, 1);
assert.equal(SEO_ROBOTS_DISALLOWED_PATHS.includes("/vk"), true);

const loadedNextConfig = nextConfigModule.default ?? nextConfigModule;
const headerGroups = await loadedNextConfig.headers();
const vkHeaders = headerGroups.find((group) => group.source === "/vk")?.headers ?? [];
assert.equal(
  vkHeaders.find((header) => header.key === "X-Robots-Tag")?.value,
  "noindex, nofollow, noarchive",
);
assert.match(
  vkHeaders.find((header) => header.key === "Content-Security-Policy")?.value ?? "",
  /^frame-ancestors 'self' https:\/\/vk\.com https:\/\/m\.vk\.com https:\/\/vk\.ru https:\/\/m\.vk\.ru$/,
);
assert.equal(vkHeaders.some((header) => header.key === "X-Frame-Options"), false);
assert.equal(
  headerGroups.some((group) =>
    group.source !== "/vk" &&
    group.headers?.some((header) => String(header.value).includes("frame-ancestors")),
  ),
  false,
);

const page = readFileSync(join(process.cwd(), "src/app/(platform)/vk/page.tsx"), "utf8");
const seo = readFileSync(join(process.cwd(), "src/lib/vk/seo.ts"), "utf8");
const screen = readFileSync(join(process.cwd(), "src/components/vk/VkMiniAppScreen.tsx"), "utf8");
assert.match(page, /VkMiniAppScreen/);
assert.match(seo, /noarchive: true/);
assert.match(seo, /index: false/);
assert.match(screen, /initVkBridge/);
assert.match(screen, /\/api\/vk\/product/);
assert.match(screen, /\/api\/vk\/playback\/session/);
assert.match(screen, /\/api\/vk\/playback\/audio/);
assert.match(screen, /MaxBottomNav/);
assert.match(screen, /selectVkTab/);
assert.match(screen, /VK_LIBRARY_GUEST_MESSAGE/);
assert.match(screen, /VK_PROFILE_GUEST_STATUS/);
assert.match(screen, /disabled/);
assert.doesNotMatch(screen, /MaxProductRating|MaxAuthorAppreciation|readMaxInitData|sign-up|history\.back|VKWebAppGetUserInfo/);
assert.doesNotMatch(screen, /href="\/catalog"|href="\/profile"|\/api\/max\//);
assert.equal(VK_LIBRARY_GUEST_MESSAGE, "Войдите в АудиоЛад, чтобы видеть сохранённое и покупки");
assert.equal(VK_PROFILE_GUEST_STATUS, "Вы используете АудиоЛад без входа");
assert.equal(VK_GUEST_LOGIN_LABEL, "Войти в АудиоЛад");
assert.equal(VK_GUEST_SIGNUP_LABEL, "Создать аккаунт");
assert.deepEqual(resolveVkShellLaunch(null), { tab: "home", productToken: null });
assert.deepEqual(resolveVkShellLaunch({ kind: "product", payload }), {
  tab: "catalog",
  productToken: payload,
});
assert.deepEqual(resolveVkShellLaunch({ kind: "smoke" }), {
  tab: "catalog",
  productToken: "smoke",
});
assert.deepEqual(
  vkTabSelectionAfterSelect({ activeTab: "catalog", nextTab: "playlists", hasProductDetail: true }),
  { tab: "playlists", closeProductDetail: true },
);
assert.deepEqual(
  vkTabSelectionAfterSelect({ activeTab: "catalog", nextTab: "catalog", hasProductDetail: true }),
  { tab: "catalog", closeProductDetail: true },
);
assert.equal(vkDetailBackTarget("home"), "home");
assert.equal(vkDetailBackTarget("deeplink"), "catalog");
assert.equal(vkDetailBackTarget("catalog"), "catalog");
assert.equal(openVkExternalHttps("https://audiolad.ru/authors/meditation"), false);
assert.deepEqual(
  readVkProductRef({ authorSlug: VK_SMOKE_AUTHOR_SLUG, productSlug: VK_SMOKE_PRODUCT_SLUG }),
  { kind: "slugs", authorSlug: VK_SMOKE_AUTHOR_SLUG, productSlug: VK_SMOKE_PRODUCT_SLUG },
);
assert.equal(readVkProductRef({ authorSlug: "../secret", productSlug: "ok" }), null);
assert.deepEqual(readVkProductRef({ target: payload }), { kind: "token", token: payload });

resetVkBridgeInitForTests();
let initCalls = 0;
await initVkBridge({
  vkBridge: {
    send(method) {
      initCalls += 1;
      assert.equal(method, VK_BRIDGE_INIT_METHOD);
      throw new Error("outside vk");
    },
  },
});
assert.equal(initCalls, 1);
await initVkBridge({});
await initVkBridge({
  vkBridge: {
    send() {
      return Promise.reject(new Error("rejected"));
    },
  },
});

function request(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      host: "audiolad.ru",
      origin: "https://audiolad.ru",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const product = {
  authorSlug: VK_SMOKE_AUTHOR_SLUG,
  productSlug: VK_SMOKE_PRODUCT_SLUG,
  title: "Музыка для крепкого сна",
  subtitle: "Спокойная музыка",
  formatLabel: "Музыка",
  coverUrl: "https://audiolad.ru/covers/sleep.jpg",
  metaLine: "Аурафон · 34 мин",
  practiceId: practiceId,
  contents: [{
    audioItemId: trackId,
    title: "Ночной фон",
    position: 1,
    durationSeconds: 120,
    audio_path: "secret/path.mp3",
  }],
};

try {
  let productLoads = 0;
  setPublishedProductLookupForTests({
    async bySlug(authorSlug, productSlug) {
      assert.equal(authorSlug, VK_SMOKE_AUTHOR_SLUG);
      assert.equal(productSlug, VK_SMOKE_PRODUCT_SLUG);
      return {
        ok: true,
        target: { authorSlug, productSlug },
      };
    },
    async byId() {
      return { ok: true, target: null };
    },
  });
  setGetMaxPublishedProductForTests(async (authorSlug, productSlug, userId) => {
    productLoads += 1;
    assert.equal(userId, null);
    assert.equal(authorSlug, VK_SMOKE_AUTHOR_SLUG);
    assert.equal(productSlug, VK_SMOKE_PRODUCT_SLUG);
    return { ok: true, product };
  });

  const opened = await postProduct(request("https://audiolad.ru/api/vk/product", { target: "smoke" }));
  const openedBody = await opened.json();
  assert.equal(opened.status, 200);
  assert.equal(openedBody.product.title, "Музыка для крепкого сна");
  assert.equal(openedBody.product.metaLine, "Аурафон · 34 мин");
  assert.equal(openedBody.product.contents[0].title, "Ночной фон");
  assert.equal("practiceId" in openedBody.product, false);
  assert.equal("audio_path" in openedBody.product.contents[0], false);
  assert.equal(openedBody.product.contents[0].audioItemId, trackId);

  setPublishedProductLookupForTests({
    async bySlug() {
      return { ok: true, target: null };
    },
    async byId() {
      return { ok: true, target: null };
    },
  });
  productLoads = 0;
  const hidden = await postProduct(request("https://audiolad.ru/api/vk/product", { target: payload }));
  assert.equal(hidden.status, 404);
  assert.equal((await hidden.json()).reason, "not_found");
  assert.equal(productLoads, 0, "unpublished target must not load product detail");

  const crossSite = await postProduct(request(
    "https://audiolad.ru/api/vk/product",
    { target: "smoke" },
    { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  ));
  assert.equal(crossSite.status, 403);

  let sessionCalls = 0;
  let signCalls = 0;
  setPublishedProductLookupForTests({
    async bySlug() {
      return {
        ok: true,
        target: {
          authorSlug: VK_SMOKE_AUTHOR_SLUG,
          productSlug: VK_SMOKE_PRODUCT_SLUG,
        },
      };
    },
    async byId(id) {
      assert.equal(id, practiceId);
      return {
        ok: true,
        target: {
          authorSlug: VK_SMOKE_AUTHOR_SLUG,
          productSlug: VK_SMOKE_PRODUCT_SLUG,
        },
      };
    },
  });
  setVkPlaybackDepsForTests({
    async getSession(userId, authorSlug, productSlug) {
      sessionCalls += 1;
      assert.equal(userId, null);
      assert.equal(authorSlug, VK_SMOKE_AUTHOR_SLUG);
      assert.equal(productSlug, VK_SMOKE_PRODUCT_SLUG);
      return {
        ok: true,
        playbackMode: "full",
        session: {
          authorSlug,
          productSlug,
          title: "Музыка для крепкого сна",
          authorName: "Аурафон",
          formatLabel: "Музыка",
          coverUrl: null,
          playbackMode: "full",
          practiceId,
          tracks: [{
            trackId,
            title: "Ночной фон",
            position: 1,
            durationSeconds: 120,
            coverUrl: null,
          }],
        },
      };
    },
    async signAudio(userId, authorSlug, productSlug, audioId) {
      signCalls += 1;
      assert.equal(userId, null);
      assert.equal(authorSlug, VK_SMOKE_AUTHOR_SLUG);
      assert.equal(productSlug, VK_SMOKE_PRODUCT_SLUG);
      assert.equal(audioId, trackId);
      return { ok: true, url: "https://cdn.example/sleep.mp3", expiresIn: 60 };
    },
  });

  const session = await postSession(request("https://audiolad.ru/api/vk/playback/session", {
    target: payload,
  }));
  const sessionBody = await session.json();
  assert.equal(session.status, 200);
  assert.equal(sessionBody.session.title, "Музыка для крепкого сна");
  assert.equal("practiceId" in sessionBody.session, false);
  assert.equal(sessionBody.session.tracks[0].trackId, trackId);

  const audio = await postAudio(request("https://audiolad.ru/api/vk/playback/audio", {
    target: "smoke",
    trackId,
  }));
  const audioBody = await audio.json();
  assert.equal(audio.status, 200);
  assert.equal(audioBody.url, "https://cdn.example/sleep.mp3");
  assert.equal(signCalls, 1);

  sessionCalls = 0;
  signCalls = 0;
  setPublishedProductLookupForTests({
    async bySlug() {
      return { ok: true, target: null };
    },
    async byId() {
      return { ok: true, target: null };
    },
  });
  const denied = await postAudio(request("https://audiolad.ru/api/vk/playback/audio", {
    target: "p_99999999999949998999999999999999",
    trackId,
  }));
  assert.equal(denied.status, 404);
  assert.equal(sessionCalls, 0);
  assert.equal(signCalls, 0);
  setPublishedProductLookupForTests({
    async bySlug(authorSlug, productSlug) {
      assert.equal(authorSlug, VK_SMOKE_AUTHOR_SLUG);
      assert.equal(productSlug, VK_SMOKE_PRODUCT_SLUG);
      return {
        ok: true,
        target: { authorSlug, productSlug },
      };
    },
    async byId() {
      return { ok: true, target: null };
    },
  });
  let productLoadsBeforeSlug = productLoads;
  const bySlug = await postProduct(request("https://audiolad.ru/api/vk/product", {
    authorSlug: VK_SMOKE_AUTHOR_SLUG,
    productSlug: VK_SMOKE_PRODUCT_SLUG,
  }));
  const bySlugBody = await bySlug.json();
  assert.equal(bySlug.status, 200);
  assert.equal(bySlugBody.product.title, "Музыка для крепкого сна");
  assert.equal(productLoads, productLoadsBeforeSlug + 1);
  assert.equal("practiceId" in bySlugBody.product, false);

  const slugSession = await postSession(request("https://audiolad.ru/api/vk/playback/session", {
    authorSlug: VK_SMOKE_AUTHOR_SLUG,
    productSlug: VK_SMOKE_PRODUCT_SLUG,
  }));
  assert.equal(slugSession.status, 200);
  const slugAudio = await postAudio(request("https://audiolad.ru/api/vk/playback/audio", {
    authorSlug: VK_SMOKE_AUTHOR_SLUG,
    productSlug: VK_SMOKE_PRODUCT_SLUG,
    trackId,
  }));
  assert.equal(slugAudio.status, 200);

  setPublishedProductLookupForTests({
    async bySlug() {
      return { ok: true, target: null };
    },
    async byId() {
      return { ok: true, target: null };
    },
  });
  productLoadsBeforeSlug = productLoads;
  const hiddenSlug = await postProduct(request("https://audiolad.ru/api/vk/product", {
    authorSlug: "hidden-author",
    productSlug: "hidden-release",
  }));
  assert.equal(hiddenSlug.status, 404);
  assert.equal(productLoads, productLoadsBeforeSlug);

  const badSlug = await postProduct(request("https://audiolad.ru/api/vk/product", {
    authorSlug: "../secret",
    productSlug: VK_SMOKE_PRODUCT_SLUG,
  }));
  assert.equal(badSlug.status, 400);
} finally {
  setPublishedProductLookupForTests(null);
  setGetMaxPublishedProductForTests(null);
  setVkPlaybackDepsForTests(null);
}

const guestCard = {
  authorSlug: VK_SMOKE_AUTHOR_SLUG,
  slug: VK_SMOKE_PRODUCT_SLUG,
  title: "Музыка для крепкого сна",
  subtitle: null,
  coverUrl: null,
  authorName: "Аурафон",
  formatLabel: "Музыка",
  priceLabel: "Бесплатно",
  isFree: true,
};

try {
  const catalogCalls = [];
  setListMaxPublishedCatalogForTests(async (input = {}) => {
    catalogCalls.push(input);
    assert.equal("userId" in input, false);
    assert.equal("limit" in input, false);
    return { ok: true, items: [guestCard] };
  });

  const home = await postHome(request("https://audiolad.ru/api/vk/home", {}));
  const homeBody = await home.json();
  assert.equal(home.status, 200);
  assert.equal(homeBody.shelves.free[0].slug, VK_SMOKE_PRODUCT_SLUG);
  assert.equal(homeBody.shelves.music.length, 1);
  assert.equal(homeBody.shelves.meditations.length, 1);
  assert.equal(catalogCalls.some((call) => call.access === "free"), true);
  assert.equal(catalogCalls.some((call) => call.section === "music"), true);
  assert.equal(catalogCalls.some((call) => call.section === "meditations"), true);
  assert.equal("practiceId" in homeBody.shelves.free[0], false);

  catalogCalls.length = 0;
  const found = await postCatalog(request("https://audiolad.ru/api/vk/catalog", {
    query: "сон",
    section: "music",
    access: "free",
    class: "release",
    topic: "sleep",
  }));
  const foundBody = await found.json();
  assert.equal(found.status, 200);
  assert.equal(foundBody.items.length, 1);
  assert.equal(catalogCalls[0].query, "сон");
  assert.equal(catalogCalls[0].section, "music");
  assert.equal(catalogCalls[0].access, "free");
  assert.equal(catalogCalls[0].class, "release");
  assert.equal(catalogCalls[0].topicKey, "sleep");
  assert.equal("limit" in catalogCalls[0], false);

  const badSection = await postCatalog(request("https://audiolad.ru/api/vk/catalog", {
    section: "secret",
  }));
  assert.equal(badSection.status, 400);

  setListMaxPublishedCatalogForTests(async () => ({ ok: false, reason: "storage_unavailable" }));
  const brokenHome = await postHome(request("https://audiolad.ru/api/vk/home", {}));
  assert.equal(brokenHome.status, 503);
  assert.equal("shelves" in await brokenHome.json(), false);

  setListMaxCatalogTopicsForTests(async () => ({
    ok: true,
    topics: [{ key: "sleep", title: "Сон" }],
  }));
  const topics = await postTopics(request("https://audiolad.ru/api/vk/catalog/topics", {}));
  const topicsBody = await topics.json();
  assert.equal(topics.status, 200);
  assert.equal(topicsBody.topics[0].key, "sleep");

  const crossHome = await postHome(request(
    "https://audiolad.ru/api/vk/home",
    {},
    { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  ));
  assert.equal(crossHome.status, 403);
} finally {
  setListMaxPublishedCatalogForTests(null);
  setListMaxCatalogTopicsForTests(null);
}

try {
  let playlistUserId = "unset";
  setListMaxPublicPlaylistsForTests(async (query, userId) => {
    playlistUserId = userId;
    assert.equal(query.q, "сон");
    assert.equal(query.access, "free");
    return {
      items: [{
        class: "playlist",
        id: "playlist-1",
        slug: "night-rest",
        href: "/playlists/night-rest",
        title: "Ночной покой",
        coverUrl: null,
        creator: "АудиоЛад",
        trackCount: 2,
        durationSeconds: 120,
        savesCount: 0,
        topics: ["сон"],
        access: "free",
        viewer: { saved: false, playing: false },
      }],
      nextCursor: null,
    };
  });
  const playlists = await postPlaylistCatalog(request("https://audiolad.ru/api/vk/playlists/catalog", {
    q: "сон",
    access: "free",
    sort: "newest",
  }));
  const playlistsBody = await playlists.json();
  assert.equal(playlists.status, 200);
  assert.equal(playlistUserId, null);
  assert.equal(playlistsBody.items[0].slug, "night-rest");
  assert.equal("viewer" in playlistsBody.items[0], false);
  assert.equal("id" in playlistsBody.items[0], false);

  let detailLoads = 0;
  setLoadMaxPublicPlaylistForTests(async () => {
    detailLoads += 1;
    return { ok: false, reason: "not_found" };
  });
  const missingPlaylist = await postPlaylistDetail(request("https://audiolad.ru/api/vk/playlists/detail", {
    slug: "../secret",
  }));
  assert.equal(missingPlaylist.status, 400);
  assert.equal(detailLoads, 0);

  const absentPlaylist = await postPlaylistDetail(request("https://audiolad.ru/api/vk/playlists/detail", {
    slug: "night-rest",
  }));
  assert.equal(absentPlaylist.status, 404);
  assert.equal(detailLoads, 1);
} finally {
  setListMaxPublicPlaylistsForTests(null);
  setLoadMaxPublicPlaylistForTests(null);
}

console.log("vk-mini-app-unit: ok");
