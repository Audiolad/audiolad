#!/usr/bin/env node
/**
 * MAX and VK Home: «Стать автором» banner, then canonical public footer.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MaxHomeScreen } from "../src/components/max/MaxHome.tsx";
import { openMaxHomeAuthorsLanding } from "../src/components/max/MaxHomeClosing.tsx";
import { openMaxHomeFooterLink } from "../src/components/max/MaxHomePublicFooter.tsx";
import { VkPublicFooter } from "../src/components/vk/VkPublicFooter.tsx";
import { openVkHomeAuthorsLanding, VkHomeClosing } from "../src/components/vk/VkHomeClosing.tsx";
import { LEGAL_LINKS } from "../src/lib/legal/links.ts";
import { resolveMaxGuestHomeAuthorUrl } from "../src/lib/max/guest-home-slider.ts";
import { MAX_SHELL_CONTENT_BOTTOM_PADDING } from "../src/lib/max/primary-tabs.ts";
import {
  isMiniAppAuthorsLandingUrl,
  isMiniAppFooterUrl,
  MINI_APP_BECOME_AUTHOR_ARIA_LABEL,
  MINI_APP_BECOME_AUTHOR_BANNER_SRC,
  MINI_APP_PUBLIC_CONTACT_EMAIL,
  miniAppAuthorsLandingUrl,
  miniAppDiscoveryFooterLinks,
  miniAppLegalFooterLinks,
} from "../src/lib/mini-app/home-public-links.ts";
import { getVisiblePublicFooterLinks } from "../src/lib/navigation/public-footer-links.ts";
import { SEO_ROBOTS_DISALLOWED_PATHS } from "../src/lib/seo/robots-config.ts";
import { MEDITATION_AUTHORS_LANDING_PROMO_LINK } from "../src/lib/seo/meditation-authors-landing/content.ts";
import { VK_BRIDGE_OPEN_LINK_METHOD } from "../src/lib/vk/bridge.ts";
import {
  isVkGuestExternalUrl,
  openVkGuestExternalUrl,
  VK_AUTHORS_LANDING_URL,
  VK_PUBLIC_CONTACT_EMAIL,
} from "../src/lib/vk/guest-links.ts";
import { buildVkFrameAncestorsPolicy } from "../src/lib/vk/launch-target.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const LANDING_URL = "https://audiolad.ru/dlya-avtorov-meditatsiy";
const BECOME_AUTHOR_URL = "https://audiolad.ru/become-author";

assert.equal(existsSync(join(root, "public/images/banners/become-author-mobile-banner-v1.webp")), true);
assert.equal(MINI_APP_BECOME_AUTHOR_BANNER_SRC, "/images/banners/become-author-mobile-banner-v1.webp");
assert.equal(MINI_APP_BECOME_AUTHOR_ARIA_LABEL, "Стать автором на АудиоЛад");
assert.equal(MEDITATION_AUTHORS_LANDING_PROMO_LINK.href, "/dlya-avtorov-meditatsiy");
assert.equal(miniAppAuthorsLandingUrl(), LANDING_URL);
assert.equal(VK_AUTHORS_LANDING_URL, LANDING_URL);
assert.equal(resolveMaxGuestHomeAuthorUrl(), LANDING_URL);
assert.equal(isMiniAppAuthorsLandingUrl(LANDING_URL), true);
assert.equal(isMiniAppAuthorsLandingUrl(BECOME_AUTHOR_URL), false);
assert.equal(isMiniAppAuthorsLandingUrl("http://audiolad.ru/dlya-avtorov-meditatsiy"), false);
assert.equal(isMiniAppAuthorsLandingUrl(`${LANDING_URL}?next=/become-author`), false);
assert.equal(isMiniAppAuthorsLandingUrl("https://evil.example/dlya-avtorov-meditatsiy"), false);
assert.equal(isVkGuestExternalUrl(LANDING_URL), true);
assert.equal(isVkGuestExternalUrl(BECOME_AUTHOR_URL), false);
assert.equal(isVkGuestExternalUrl("https://audiolad.ru/articles"), false);
assert.equal(MINI_APP_PUBLIC_CONTACT_EMAIL, "1@audiolad.ru");
assert.equal(VK_PUBLIC_CONTACT_EMAIL, "1@audiolad.ru");

const discovery = miniAppDiscoveryFooterLinks();
const legal = miniAppLegalFooterLinks();
assert.deepEqual(
  discovery.map((item) => [item.title, item.href, item.url]),
  [
    ["О платформе", "/about", "https://audiolad.ru/about"],
    ["Принципы", "/philosophy", "https://audiolad.ru/philosophy"],
    ["Авторам", "/for-authors", "https://audiolad.ru/for-authors"],
    ["Помощь и поддержка", "/help", "https://audiolad.ru/help"],
  ],
);
assert.deepEqual(
  legal.map((item) => [item.title, item.url]),
  LEGAL_LINKS.map((item) => [item.title, `https://audiolad.ru${item.href}`]),
);
assert.equal(discovery.some((item) => item.href === "/articles"), false);
assert.equal(getVisiblePublicFooterLinks(null).some((item) => item.href === "/articles"), false);
assert.equal(getVisiblePublicFooterLinks("1@audiolad.ru").some((item) => item.href === "/articles"), true);
for (const item of [...discovery, ...legal]) {
  assert.match(item.url, /^https:\/\/audiolad\.ru\//);
  assert.equal(item.url.includes("become-author"), false);
  assert.equal(isMiniAppFooterUrl(item.url), true);
  assert.equal(item.url.startsWith("https://"), true);
}
assert.equal(isMiniAppFooterUrl(BECOME_AUTHOR_URL), false);
assert.equal(isMiniAppFooterUrl("https://audiolad.ru/articles"), false);
assert.equal(isMiniAppFooterUrl("http://audiolad.ru/offer"), false);
assert.equal(isMiniAppFooterUrl("javascript:alert(1)"), false);
assert.equal(isMiniAppFooterUrl(LANDING_URL), false);

const home = read("src/components/max/MaxHome.tsx");
const vkPanel = read("src/components/vk/VkHomePanel.tsx");
const maxClosing = read("src/components/max/MaxHomeClosing.tsx");
const vkClosing = read("src/components/vk/VkHomeClosing.tsx");
const maxFooter = read("src/components/max/MaxHomePublicFooter.tsx");
const vkFooter = read("src/components/vk/VkPublicFooter.tsx");
const banner = read("src/components/mini-app/MiniAppBecomeAuthorBanner.tsx");
const links = read("src/lib/mini-app/home-public-links.ts");
const productFooter = read("src/components/max/MaxProductLegalFooter.tsx");
const productDetail = read("src/components/max/MaxProductDetailView.tsx");
const maxShell = read("src/components/max/MaxAuthenticatedHome.tsx");
const vkShell = read("src/components/vk/VkMiniAppScreen.tsx");
const nextConfig = read("next.config.ts");

assert.ok(home.indexOf("data-max-home-shelf") < home.lastIndexOf("<MaxHomeClosing"));
assert.match(home, /\{closing \?\? <MaxHomeClosing \/>\}/);
assert.match(vkPanel, /closing=\{<VkHomeClosing \/>\}/);
assert.match(maxClosing, /openMaxHomeAuthorsLanding/);
assert.match(maxClosing, /openMaxExternalLink/);
assert.match(vkClosing, /openVkHomeAuthorsLanding/);
assert.match(vkClosing, /openVkGuestExternalUrl/);
assert.match(vkClosing, /VkPublicFooter variant="home"/);
assert.match(maxFooter, /openMaxExternalLink/);
assert.match(links, /getVisiblePublicFooterLinks\(null\)/);
assert.match(links, /LEGAL_LINKS/);
assert.match(links, /MEDITATION_AUTHORS_LANDING_PROMO_LINK/);
assert.match(banner, /MINI_APP_BECOME_AUTHOR_BANNER_SRC/);
assert.match(banner, /<button/);
assert.doesNotMatch(banner, /<a[\s>]|href=|\/become-author|next\/link/);
assert.match(links, /pathname === "\/become-author"/);
assert.doesNotMatch(`${maxClosing}\n${vkClosing}\n${maxFooter}\n${banner}`, /\/become-author/);
assert.doesNotMatch(productFooter, /MiniAppBecomeAuthorBanner|getVisiblePublicFooterLinks|data-max-home-legal/);
assert.match(productFooter, /data-max-product-legal-footer/);
assert.match(productDetail, /<MaxProductLegalFooter/);
assert.doesNotMatch(productDetail, /MaxHomeClosing|VkPublicFooter|MiniAppBecomeAuthorBanner/);
assert.match(vkFooter, /data-vk-profile-legal/);
assert.match(vkFooter, /data-vk-product-legal/);
assert.match(vkFooter, /data-vk-home-legal/);
assert.match(vkFooter, /openVkGuestExternalUrl\(item\.url\)/);
assert.match(maxShell, /MAX_SHELL_CONTENT_BOTTOM_PADDING/);
assert.match(maxShell, /<MaxBottomNav/);
assert.match(vkShell, /MAX_SHELL_CONTENT_BOTTOM_PADDING/);
assert.match(vkShell, /<MaxBottomNav/);
assert.match(vkShell, /VkPublicFooter variant="profile"/);
assert.match(vkShell, /VkPublicFooter variant="product"/);
assert.equal(SEO_ROBOTS_DISALLOWED_PATHS.includes("/vk"), true);
assert.equal(
  buildVkFrameAncestorsPolicy(),
  "frame-ancestors 'self' https://vk.com https://m.vk.com https://vk.ru https://m.vk.ru",
);
assert.match(nextConfig, /buildVkFrameAncestorsPolicy\(\)/);
assert.equal(MAX_SHELL_CONTENT_BOTTOM_PADDING.includes("68px"), true);
assert.equal(MAX_SHELL_CONTENT_BOTTOM_PADDING.includes("safe-area-inset-bottom"), true);

const shelfProduct = {
  authorSlug: "author",
  slug: "free-one",
  title: "Бесплатная практика",
  subtitle: null,
  coverUrl: null,
  authorName: "Автор",
  formatLabel: "Практика",
  priceLabel: "Бесплатно",
  isFree: true,
};

function renderHome({ guestMode, platform, status = "ready" }) {
  return renderToStaticMarkup(
    createElement(MaxHomeScreen, {
      guestMode,
      status,
      shelves: status === "ready" ? { free: [shelfProduct], music: [], meditations: [] } : null,
      onListenFree: () => {},
      onSlideAction: () => {},
      onOpenSection: () => {},
      onOpenShelf: () => {},
      onSelectProduct: () => {},
      closing: platform === "vk" ? createElement(VkHomeClosing) : undefined,
    }),
  );
}

function assertHomeClosing(markup, footerMarker) {
  const shelfAt = markup.indexOf('data-max-home-shelf="free"');
  const bannerAt = markup.indexOf("data-mini-app-become-author-banner");
  const footerAt = markup.indexOf(footerMarker);
  assert.ok(shelfAt >= 0 && bannerAt > shelfAt && footerAt > bannerAt, footerMarker);
  assert.match(markup, new RegExp(`aria-label="${MINI_APP_BECOME_AUTHOR_ARIA_LABEL}"`));
  assert.match(markup, new RegExp(`src="${MINI_APP_BECOME_AUTHOR_BANNER_SRC}"`));
  assert.match(markup, /max-w-lg/);
  assert.match(markup, /rounded-\[24px\]/);
  assert.match(markup, /pb-4/);
  const body = markup.replace(/<link\b[^>]*>/g, "");
  assert.doesNotMatch(body, /<a[\s>]|href=/);
  assert.doesNotMatch(body, /\/become-author(?!-)/);
  assert.doesNotMatch(body, /Статьи|\/articles(?!-)/);
  for (const item of [...discovery, ...legal]) {
    assert.ok(markup.includes(item.title), item.title);
  }
  assert.ok(markup.includes("1@audiolad.ru"));
  assert.ok(markup.includes("Контакт для связи"));
}

const maxGuest = renderHome({ guestMode: true, platform: "max" });
const maxLinked = renderHome({ guestMode: false, platform: "max" });
const maxLoading = renderHome({ guestMode: false, platform: "max", status: "loading" });
const vkGuest = renderHome({ guestMode: true, platform: "vk" });

assert.match(maxGuest, /data-mini-app-home-closing="max"/);
assert.match(maxGuest, /data-max-home-legal/);
assert.match(maxGuest, /data-max-home-guest="true"/);
assert.doesNotMatch(maxGuest, /data-vk-home-legal|data-max-product-legal-footer/);
assertHomeClosing(maxGuest, "data-max-home-legal");

assert.match(maxLinked, /data-mini-app-home-closing="max"/);
assert.match(maxLinked, /data-max-home-guest="false"/);
assertHomeClosing(maxLinked, "data-max-home-legal");

assert.match(maxLoading, /data-mini-app-become-author-banner/);
assert.match(maxLoading, /data-max-home-legal/);
assert.doesNotMatch(maxLoading, /data-max-home-shelf=/);

assert.match(vkGuest, /data-mini-app-home-closing="vk"/);
assert.match(vkGuest, /data-vk-home-legal/);
assert.doesNotMatch(vkGuest, /data-max-home-legal|data-vk-product-legal|data-vk-profile-legal/);
assertHomeClosing(vkGuest, "data-vk-home-legal");

const profileFooter = renderToStaticMarkup(createElement(VkPublicFooter, { variant: "profile" }));
const productVkFooter = renderToStaticMarkup(createElement(VkPublicFooter, { variant: "product" }));
assert.match(profileFooter, /data-vk-profile-legal/);
assert.ok(profileFooter.includes("О платформе"));
assert.ok(profileFooter.includes("Публичная оферта"));
assert.doesNotMatch(profileFooter, /data-vk-home-legal|Статьи/);
assert.match(productVkFooter, /data-vk-product-legal/);
assert.ok(productVkFooter.includes("Публичная оферта"));
assert.ok(productVkFooter.includes("Политика обработки персональных данных"));
assert.doesNotMatch(productVkFooter, /О платформе|data-vk-home-legal|Статьи/);

assert.equal(openMaxHomeAuthorsLanding(LANDING_URL), false);
assert.equal(openMaxHomeAuthorsLanding(BECOME_AUTHOR_URL), false);
assert.equal(openMaxHomeFooterLink("https://audiolad.ru/offer"), false);
assert.equal(openVkHomeAuthorsLanding(LANDING_URL), false);
assert.equal(openVkHomeAuthorsLanding(BECOME_AUTHOR_URL), false);
assert.equal(openVkGuestExternalUrl(BECOME_AUTHOR_URL), false);

const previousWindow = globalThis.window;
try {
  function installWindow(extra = {}) {
    const opened = [];
    const bridgeSent = [];
    globalThis.window = {
      open(url, target, features) {
        opened.push({ url, target, features });
        return {};
      },
      ...extra,
    };
    return { opened, bridgeSent };
  }

  const maxBrowser = installWindow();
  assert.equal(openMaxHomeAuthorsLanding(LANDING_URL), true);
  assert.deepEqual(maxBrowser.opened, [{
    url: LANDING_URL,
    target: "_blank",
    features: "noopener,noreferrer",
  }]);
  assert.equal(openMaxHomeAuthorsLanding(BECOME_AUTHOR_URL), false);
  assert.equal(openMaxHomeAuthorsLanding("http://audiolad.ru/dlya-avtorov-meditatsiy"), false);
  assert.equal(openMaxHomeAuthorsLanding("javascript:alert(1)"), false);
  assert.equal(maxBrowser.opened.length, 1);
  assert.equal(openMaxHomeFooterLink("https://audiolad.ru/offer"), true);
  assert.equal(maxBrowser.opened.at(-1).url, "https://audiolad.ru/offer");
  assert.equal(openMaxHomeFooterLink(BECOME_AUTHOR_URL), false);
  assert.equal(openMaxHomeFooterLink("https://audiolad.ru/articles"), false);
  assert.equal(openMaxHomeFooterLink("http://audiolad.ru/privacy"), false);
  assert.equal(maxBrowser.opened.length, 2);
  for (const item of [...discovery, ...legal]) {
    assert.equal(openMaxHomeFooterLink(item.url), true);
    assert.equal(maxBrowser.opened.at(-1).url, item.url);
    assert.match(item.url, /^https:\/\//);
  }

  const openedByBridge = [];
  const maxBridge = installWindow({
    WebApp: {
      openLink(url) {
        openedByBridge.push(url);
      },
    },
  });
  assert.equal(openMaxHomeAuthorsLanding(LANDING_URL), true);
  assert.deepEqual(openedByBridge, [LANDING_URL]);
  assert.equal(maxBridge.opened.length, 0);
  assert.equal(openMaxHomeFooterLink("https://audiolad.ru/privacy"), true);
  assert.equal(openedByBridge.at(-1), "https://audiolad.ru/privacy");
  assert.match(openedByBridge.at(-1), /^https:\/\//);

  const vkBrowser = installWindow({
    vkBridge: {
      isEmbedded() {
        return false;
      },
      send() {
        throw new Error("bridge must stay unused in a normal browser");
      },
    },
  });
  assert.equal(openVkHomeAuthorsLanding(LANDING_URL), true);
  assert.equal(vkBrowser.opened[0].url, LANDING_URL);
  assert.match(vkBrowser.opened[0].url, /^https:\/\//);
  assert.equal(openVkHomeAuthorsLanding(BECOME_AUTHOR_URL), false);
  assert.equal(vkBrowser.opened.length, 1);

  const vkEmbedded = installWindow();
  const sent = [];
  globalThis.window.vkBridge = {
    isEmbedded() {
      return true;
    },
    send(method, params) {
      sent.push({ method, params });
      assert.equal(method, VK_BRIDGE_OPEN_LINK_METHOD);
      assert.equal(params.url, LANDING_URL);
      assert.match(params.url, /^https:\/\//);
      return { ok: true };
    },
  };
  assert.equal(openVkHomeAuthorsLanding(LANDING_URL), true);
  assert.equal(sent.length, 1);
  assert.equal(vkEmbedded.opened.length, 0);
  assert.equal(openVkHomeAuthorsLanding(BECOME_AUTHOR_URL), false);
  assert.equal(sent.length, 1);
} finally {
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
}

console.log("mini-app-home-banner-footer-unit: ok");
