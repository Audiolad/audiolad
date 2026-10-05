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
  VK_BRIDGE_OPEN_LINK_METHOD,
} from "../src/lib/vk/bridge.ts";
import { LEGAL_LINKS } from "../src/lib/legal/links.ts";
import { formatRubles } from "../src/lib/products/price-format.ts";
import {
  resolveMaxGuestHomeAuthorUrl,
  resolveMaxGuestHomeSlideAction,
} from "../src/lib/max/guest-home-slider.ts";
import {
  getVkDiscoveryFooterLinks,
  getVkLegalFooterLinks,
  isVkGuestExternalUrl,
  openVkGuestExternalUrl,
  VK_GUEST_LOGIN_URL,
  VK_GUEST_SIGNUP_URL,
  VK_PUBLIC_CONTACT_EMAIL,
} from "../src/lib/vk/guest-links.ts";
import { readVkProductView } from "../src/lib/vk/product-view.ts";
import {
  openVkCanonicalPracticePage,
  vkBuyCtaLabel,
  vkCanonicalPracticeUrl,
  vkProductCommerce,
} from "../src/lib/vk/purchase.ts";
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
assert.match(screen, /data-vk-guest-auth/);
assert.match(screen, /VkPublicFooter variant="profile"/);
assert.match(screen, /VkPublicFooter variant="product"/);
assert.match(screen, /data-vk-product-purchase/);
assert.match(screen, /data-vk-buy/);
assert.match(screen, /openVkCanonicalPracticePage/);
assert.match(screen, /vkProductCommerce/);
assert.match(screen, /product\.appreciation \?/);
assert.match(screen, /VkAuthorAppreciation/);
assert.match(screen, /PREVIEW_ACTION_LABEL/);
assert.match(screen, /openVkGuestExternalUrl\(VK_GUEST_LOGIN_URL\)/);
assert.match(screen, /openVkGuestExternalUrl\(VK_GUEST_SIGNUP_URL\)/);
assert.match(screen, /onRequestLogin=\{\(\) => \{/);
assert.match(screen, /onRequestSignup=\{\(\) => \{/);
assert.match(screen, /action\.type === "library"/);
const vkGuestSlideHandler = screen.slice(
  screen.indexOf("function applyGuestHomeSlide"),
  screen.indexOf("const showProduct"),
);
assert.match(vkGuestSlideHandler, /resolveMaxGuestHomeSlideAction\(slideId\)/);
assert.match(vkGuestSlideHandler, /action\.type === "library"/);
assert.match(vkGuestSlideHandler, /selectVkTab\("library"\)/);
assert.match(vkGuestSlideHandler, /openVkExternalHttps\(action\.url\)/);
assert.doesNotMatch(
  vkGuestSlideHandler,
  /signup|VK_GUEST_SIGNUP_URL|\/auth\/|become-author/,
);
const vkLibraryPane = screen.slice(
  screen.indexOf('data-vk-panel="library"'),
  screen.indexOf('data-vk-panel="profile"'),
);
assert.match(vkLibraryPane, /data-vk-library-guest/);
assert.match(vkLibraryPane, /VK_LIBRARY_GUEST_MESSAGE/);
assert.match(vkLibraryPane, /<VkGuestAuthActions \/>/);
assert.deepEqual(resolveMaxGuestHomeSlideAction("06"), { type: "library" });
assert.notEqual(resolveMaxGuestHomeSlideAction("06")?.type, "signup");
assert.equal(
  resolveMaxGuestHomeAuthorUrl(),
  "https://audiolad.ru/dlya-avtorov-meditatsiy",
);
assert.deepEqual(resolveMaxGuestHomeSlideAction("07"), {
  type: "external",
  url: "https://audiolad.ru/dlya-avtorov-meditatsiy",
});
assert.equal(
  new URL(resolveMaxGuestHomeSlideAction("07").url).pathname,
  "/dlya-avtorov-meditatsiy",
);
assert.equal(
  resolveMaxGuestHomeSlideAction("07").url.includes("become-author"),
  false,
);
assert.equal(resolveMaxGuestHomeSlideAction("07").url.includes("/auth/"), false);
assert.equal(isVkGuestExternalUrl(resolveMaxGuestHomeSlideAction("07").url), true);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/become-author"), false);
assert.doesNotMatch(screen, /\bdisabled\b/);
assert.doesNotMatch(screen, /cursor-not-allowed|opacity-60/);
assert.doesNotMatch(screen, /smoke|placeholder|TODO|stack/i);
assert.doesNotMatch(screen, /MaxProductRating|MaxAuthorAppreciation|readMaxInitData|sign-up|history\.back|VKWebAppGetUserInfo/);
assert.doesNotMatch(screen, /href="\/catalog"|href="\/profile"|\/api\/max\//);
assert.doesNotMatch(screen, /author_id|practice_id|BuyPracticeButton|\/api\/orders/);
assert.equal(VK_LIBRARY_GUEST_MESSAGE, "Войдите в АудиоЛад, чтобы видеть сохранённое и покупки");
assert.equal(VK_PROFILE_GUEST_STATUS, "Вы используете АудиоЛад без входа");
assert.equal(VK_GUEST_LOGIN_LABEL, "Войти в АудиоЛад");
assert.equal(VK_GUEST_SIGNUP_LABEL, "Создать аккаунт");
assert.equal(VK_GUEST_LOGIN_URL, "https://audiolad.ru/auth/sign-in");
assert.equal(VK_GUEST_SIGNUP_URL, "https://audiolad.ru/auth/sign-up");
assert.equal(VK_PUBLIC_CONTACT_EMAIL, "1@audiolad.ru");
assert.deepEqual(
  getVkDiscoveryFooterLinks().map((item) => [item.title, item.url]),
  [
    ["О платформе", "https://audiolad.ru/about"],
    ["Принципы", "https://audiolad.ru/philosophy"],
    ["Авторам", "https://audiolad.ru/for-authors"],
    ["Помощь и поддержка", "https://audiolad.ru/help"],
  ],
);
assert.deepEqual(
  getVkLegalFooterLinks().map((item) => [item.title, item.url]),
  LEGAL_LINKS.map((item) => [item.title, `https://audiolad.ru${item.href}`]),
);
assert.equal(getVkDiscoveryFooterLinks().some((item) => item.href === "/articles"), false);
assert.equal(isVkGuestExternalUrl(VK_GUEST_LOGIN_URL), true);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/auth/sign-in/"), false);
assert.equal(isVkGuestExternalUrl("https://evil.example/privacy"), false);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/privacy"), true);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/help"), true);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/help/support"), false);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/articles"), false);
assert.equal(
  vkCanonicalPracticeUrl(VK_SMOKE_AUTHOR_SLUG, VK_SMOKE_PRODUCT_SLUG),
  `https://audiolad.ru/practice/${VK_SMOKE_AUTHOR_SLUG}/${VK_SMOKE_PRODUCT_SLUG}`,
);
assert.equal(vkCanonicalPracticeUrl("../secret", VK_SMOKE_PRODUCT_SLUG), null);
assert.equal(vkBuyCtaLabel(formatRubles(500)), `Купить за ${formatRubles(500)}`);
assert.equal(vkBuyCtaLabel("Подарок"), null);
assert.equal(vkBuyCtaLabel("Цена уточняется"), null);
assert.deepEqual(vkProductCommerce({ isFree: false, priceLabel: formatRubles(500) }), {
  priceLabel: formatRubles(500),
  buyLabel: `Купить за ${formatRubles(500)}`,
});
assert.deepEqual(vkProductCommerce({ isFree: true, priceLabel: formatRubles(500) }), {
  priceLabel: null,
  buyLabel: null,
});
const footer = readFileSync(join(process.cwd(), "src/components/vk/VkPublicFooter.tsx"), "utf8");
const appreciationUi = readFileSync(join(process.cwd(), "src/components/vk/VkAuthorAppreciation.tsx"), "utf8");
assert.match(footer, /getVkDiscoveryFooterLinks\(\)/);
assert.match(footer, /getVkLegalFooterLinks\(\)/);
assert.match(footer, /VK_PUBLIC_CONTACT_EMAIL/);
assert.match(footer, /openVkGuestExternalUrl\(item\.url\)/);
assert.match(footer, /data-vk-profile-legal/);
assert.match(footer, /data-vk-product-legal/);
assert.match(footer, /variant === "product" \? \[\] : getVkDiscoveryFooterLinks\(\)/);
assert.match(footer, /data-vk-home-legal/);
assert.match(footer, /variant: "profile" \| "product" \| "home"/);
assert.doesNotMatch(footer, /\/articles|Статьи|help\/support/);
assert.match(appreciationUi, /❤️ Поблагодарить автора/);
assert.match(appreciationUi, /\/api\/vk\/appreciation/);
assert.match(appreciationUi, /guestEmail/);
assert.match(appreciationUi, /\[100, 300, 500, 1000\]/);
assert.match(appreciationUi, /openVkExternalHttps/);
assert.match(appreciationUi, /data-vk-appreciation-email/);
assert.match(appreciationUi, /пока платёж не подтверждён/);
assert.doesNotMatch(appreciationUi, /author_id|practice_id|authorId|practiceId|readMaxInitData|оплачено/);
assert.equal(screen.split("VkGuestAuthActions").length, 4);
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
assert.equal(openVkGuestExternalUrl(VK_GUEST_LOGIN_URL), false);
assert.equal(openVkGuestExternalUrl("https://audiolad.ru/admin"), false);
assert.equal(openVkCanonicalPracticePage(VK_SMOKE_AUTHOR_SLUG, VK_SMOKE_PRODUCT_SLUG), false);

const previousWindow = globalThis.window;
try {
  function installWindow(vkBridge) {
    const opened = [];
    const sent = [];
    globalThis.window = {
      open(url, target, features) {
        opened.push({ url, target, features });
        return {};
      },
      parent: null,
      vkBridge,
      get sent() {
        return sent;
      },
    };
    if (vkBridge) {
      globalThis.window.vkBridge = {
        ...vkBridge,
        send(method, params) {
          sent.push({ method, params });
          return vkBridge.send(method, params);
        },
      };
    }
    return { opened, sent };
  }

  const ordinary = installWindow({
    isEmbedded() {
      return false;
    },
    send() {
      throw new Error("bridge must stay unused in a normal browser");
    },
  });
  assert.equal(openVkExternalHttps("https://audiolad.ru/authors/meditation"), true);
  assert.equal(ordinary.sent.length, 0);
  assert.deepEqual(ordinary.opened, [{
    url: "https://audiolad.ru/authors/meditation",
    target: "_blank",
    features: "noopener,noreferrer",
  }]);

  const scriptOnly = installWindow({
    send() {
      throw new Error("loaded script is not a VK client");
    },
  });
  assert.equal(openVkGuestExternalUrl(VK_GUEST_SIGNUP_URL), true);
  assert.equal(scriptOnly.sent.length, 0);
  assert.equal(scriptOnly.opened[0].url, VK_GUEST_SIGNUP_URL);

  const embedded = installWindow({
    isEmbedded() {
      return true;
    },
    send(method, params) {
      assert.equal(method, VK_BRIDGE_OPEN_LINK_METHOD);
      assert.equal(params.url, "https://audiolad.ru/privacy");
      return { ok: true };
    },
  });
  assert.equal(
    openVkGuestExternalUrl(getVkLegalFooterLinks().find((item) => item.href === "/privacy").url),
    true,
  );
  assert.equal(embedded.sent.length, 1);
  assert.equal(embedded.sent[0].method, VK_BRIDGE_OPEN_LINK_METHOD);
  assert.equal(embedded.opened.length, 0);

  const practiceUrl = vkCanonicalPracticeUrl(VK_SMOKE_AUTHOR_SLUG, VK_SMOKE_PRODUCT_SLUG);
  const practiceBridge = installWindow({
    isEmbedded() {
      return true;
    },
    send(method, params) {
      assert.equal(method, VK_BRIDGE_OPEN_LINK_METHOD);
      assert.equal(params.url, practiceUrl);
      return { ok: true };
    },
  });
  assert.equal(openVkCanonicalPracticePage(VK_SMOKE_AUTHOR_SLUG, VK_SMOKE_PRODUCT_SLUG), true);
  assert.equal(practiceBridge.sent.length, 1);
  assert.equal(practiceBridge.opened.length, 0);
  assert.equal(openVkCanonicalPracticePage("../secret", VK_SMOKE_PRODUCT_SLUG), false);
  assert.equal(practiceBridge.sent.length, 1);

  const rejected = installWindow({
    isEmbedded() {
      return true;
    },
    send() {
      return Promise.reject(new Error("open link failed"));
    },
  });
  assert.equal(openVkGuestExternalUrl("https://audiolad.ru/offer"), true);
  assert.equal(rejected.opened.length, 0);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(rejected.opened[0].url, "https://audiolad.ru/offer");

  const thrown = installWindow({
    isEmbedded() {
      return true;
    },
    send() {
      throw new Error("bridge unavailable");
    },
  });
  assert.equal(openVkGuestExternalUrl("https://audiolad.ru/help"), true);
  assert.equal(thrown.opened[0].url, "https://audiolad.ru/help");

  const crashedEmbed = installWindow({
    isEmbedded() {
      throw new Error("embed check failed");
    },
    send() {
      throw new Error("must not be called");
    },
  });
  assert.equal(openVkGuestExternalUrl(VK_GUEST_LOGIN_URL), true);
  assert.equal(crashedEmbed.sent.length, 0);
  assert.equal(crashedEmbed.opened[0].url, VK_GUEST_LOGIN_URL);

  globalThis.window = {
    open() {
      throw new Error("popup blocked");
    },
  };
  assert.equal(openVkExternalHttps("https://audiolad.ru/privacy"), false);
  assert.equal(openVkExternalHttps("http://audiolad.ru/privacy"), false);
  assert.equal(openVkExternalHttps("https://user:secret@audiolad.ru/privacy"), false);
  assert.equal(openVkExternalHttps("not a url"), false);
  assert.equal(openVkGuestExternalUrl("javascript:alert(1)"), false);
} finally {
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
}
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
  priceLabel: formatRubles(500),
  isFree: false,
  appreciation: { authorName: "Аурафон", authorId: "should-not-leak" },
  practiceId: practiceId,
  authorId: "should-not-leak",
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
  assert.equal("authorId" in openedBody.product, false);
  assert.equal("author_id" in openedBody.product, false);
  assert.equal("practice_id" in openedBody.product, false);
  assert.equal(openedBody.product.isFree, false);
  assert.equal(openedBody.product.priceLabel, formatRubles(500));
  assert.deepEqual(openedBody.product.appreciation, { authorName: "Аурафон" });
  assert.equal("audio_path" in openedBody.product.contents[0], false);
  assert.equal(openedBody.product.contents[0].audioItemId, trackId);
  const parsedProduct = readVkProductView(openedBody.product);
  assert.equal(parsedProduct?.title, "Музыка для крепкого сна");
  assert.deepEqual(vkProductCommerce(parsedProduct), {
    priceLabel: formatRubles(500),
    buyLabel: `Купить за ${formatRubles(500)}`,
  });
  assert.equal(readVkProductView({
    ...openedBody.product,
    appreciation: { authorName: "Аурафон", practice_id: practiceId },
  }), null);
  assert.equal(readVkProductView({
    ...openedBody.product,
    author_id: "client-author",
  }), null);

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
