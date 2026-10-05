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
  activateVkAuthorsLandingClick,
  detectVkAuthorsLandingClient,
} from "../src/lib/vk/authors-landing-click.ts";
import {
  getVkDiscoveryFooterLinks,
  getVkLegalFooterLinks,
  isVkGuestExternalUrl,
  isVkPublicFooterUrl,
  openVkGuestExternalUrl,
  VK_AUTHORS_LANDING_URL,
  VK_GUEST_LOGIN_URL,
  VK_PUBLIC_CONTACT_EMAIL,
} from "../src/lib/vk/guest-links.ts";
import {
  activateVkPublicFooterClick,
} from "../src/lib/vk/public-anchor-click.ts";
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
assert.match(banner, /<a[\s>]/);
assert.match(banner, /href=\{url\}/);
assert.match(banner, /target=\{MEDITATION_AUTHORS_LANDING_PROMO_LINK\.target\}/);
assert.match(banner, /rel=\{MEDITATION_AUTHORS_LANDING_PROMO_LINK\.rel\}/);
assert.match(banner, /anchorClick\(event, url\)/);
assert.match(banner, /pointer-events-none/);
assert.match(banner, /pointer-events-auto/);
assert.match(banner, /touchAction: "manipulation"/);
assert.doesNotMatch(banner, /preventDefault|\/become-author|next\/link/);
assert.match(vkClosing, /anchorClick=\{activateVkAuthorsLandingClick\}/);
assert.doesNotMatch(maxClosing, /anchorClick|activateVkAuthorsLandingClick/);
assert.match(vkFooter, /<a[\s>]/);
assert.match(vkFooter, /activateVkPublicFooterClick\(event, item\.url\)/);
assert.match(vkFooter, /href=\{item\.url\}/);
assert.match(vkFooter, /target="_blank"/);
assert.match(vkFooter, /rel="noopener noreferrer"/);
assert.match(vkFooter, /touchAction: "manipulation"/);
assert.match(vkFooter, /mailto:\$\{VK_PUBLIC_CONTACT_EMAIL\}/);
assert.match(vkFooter, /isVkPublicFooterUrl\(item\.url\)/);
assert.doesNotMatch(vkFooter, /<button|activateVkAuthorsLandingClick|openVkGuestExternalUrl/);
const vkFooterEmail = vkFooter.slice(vkFooter.indexOf("Контакт для связи"));
assert.match(vkFooterEmail, /mailto:/);
assert.doesNotMatch(vkFooterEmail, /activateVkPublicFooterClick|openVkGuestExternalUrl|preventDefault|vkBridge|target=/);
assert.doesNotMatch(maxFooter, /mailto:|activateVkPublicFooterClick|<a[\s>]/);
assert.doesNotMatch(productFooter, /mailto:|activateVkPublicFooterClick|<a[\s>]/);
assert.doesNotMatch(maxFooter, /<a[\s>]/);
assert.match(links, /pathname === "\/become-author"/);
assert.doesNotMatch(`${maxClosing}\n${vkClosing}\n${maxFooter}\n${banner}`, /\/become-author/);
assert.doesNotMatch(productFooter, /MiniAppBecomeAuthorBanner|getVisiblePublicFooterLinks|data-max-home-legal/);
assert.match(productFooter, /data-max-product-legal-footer/);
assert.match(productDetail, /<MaxProductLegalFooter/);
assert.doesNotMatch(productDetail, /MaxHomeClosing|VkPublicFooter|MiniAppBecomeAuthorBanner/);
assert.match(vkFooter, /data-vk-profile-legal/);
assert.match(vkFooter, /data-vk-product-legal/);
assert.match(vkFooter, /data-vk-home-legal/);
assert.match(vkFooter, /activateVkPublicFooterClick/);
assert.match(read("src/lib/vk/public-anchor-click.ts"), /openVkGuestExternalUrl/);
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

function assertHomeClosing(markup, footerMarker, anchorMode) {
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
  const bannerHtml = body.slice(body.indexOf("data-mini-app-become-author-banner"), body.indexOf(footerMarker));
  const footerHtml = body.slice(body.indexOf(footerMarker));
  assert.match(bannerHtml, /pointer-events-auto/);
  assert.match(bannerHtml, /pointer-events-none/);
  assert.doesNotMatch(bannerHtml, /pointer-events-none[^>]*data-vk-authors-landing-anchor|data-vk-authors-landing-anchor[^>]*pointer-events-none/);
  if (anchorMode === "vk-anchor") {
    assert.equal(bannerHtml.match(/<a\b/g)?.length, 1);
    assert.match(bannerHtml, /data-vk-authors-landing-anchor=""/);
    assert.match(bannerHtml, /href="https:\/\/audiolad\.ru\/dlya-avtorov-meditatsiy"/);
    assert.match(bannerHtml, /target="_blank"/);
    assert.match(bannerHtml, /rel="noopener noreferrer"/);
    assert.match(bannerHtml, /touch-action:manipulation/);
    assert.doesNotMatch(bannerHtml, /<button/);
    assert.doesNotMatch(footerHtml, /<button/);
    for (const item of [...discovery, ...legal]) {
      assert.ok(footerHtml.includes(`href="${item.url}"`), item.url);
    }
    assert.ok(footerHtml.includes('href="mailto:1@audiolad.ru"'));
    assert.match(footerHtml, /target="_blank"/);
    assert.match(footerHtml, /rel="noopener noreferrer"/);
    assert.match(footerHtml, /touch-action:manipulation/);
    assert.doesNotMatch(footerHtml, /become-author|\/articles|javascript:/);
  } else {
    assert.doesNotMatch(body, /<a[\s>]|href=/);
    assert.match(bannerHtml, /<button/);
  }
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
assertHomeClosing(maxGuest, "data-max-home-legal", "button");

assert.match(maxLinked, /data-mini-app-home-closing="max"/);
assert.match(maxLinked, /data-max-home-guest="false"/);
assertHomeClosing(maxLinked, "data-max-home-legal", "button");

assert.match(maxLoading, /data-mini-app-become-author-banner/);
assert.match(maxLoading, /data-max-home-legal/);
assert.doesNotMatch(maxLoading, /data-max-home-shelf=/);

assert.match(vkGuest, /data-mini-app-home-closing="vk"/);
assert.match(vkGuest, /data-vk-home-legal/);
assert.doesNotMatch(vkGuest, /data-max-home-legal|data-vk-product-legal|data-vk-profile-legal/);
assertHomeClosing(vkGuest, "data-vk-home-legal", "vk-anchor");
assert.doesNotMatch(maxLoading, /<a[\s>]|data-vk-authors-landing-anchor/);

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

function footerHrefs(markup) {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

function assertVkFooterAnchors(markup, items) {
  assert.doesNotMatch(markup, /<button/);
  const webUrls = items.map((item) => item.url);
  assert.deepEqual(footerHrefs(markup), [...webUrls, "mailto:1@audiolad.ru"]);
  for (const url of webUrls) {
    const href = `href="${url}"`;
    const at = markup.indexOf(href);
    assert.ok(at >= 0, url);
    const tag = markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
    assert.match(tag, /^<a\b/);
    assert.match(tag, /target="_blank"/);
    assert.match(tag, /rel="noopener noreferrer"/);
    assert.match(tag, /data-vk-public-footer-link=""/);
    assert.match(tag, /touch-action:manipulation/);
    assert.match(url, /^https:\/\/audiolad\.ru\//);
  }
  const mailAt = markup.indexOf('href="mailto:1@audiolad.ru"');
  assert.ok(mailAt >= 0);
  const mailTag = markup.slice(markup.lastIndexOf("<", mailAt), markup.indexOf(">", mailAt) + 1);
  assert.match(mailTag, /^<a\b/);
  assert.doesNotMatch(mailTag, /target=|data-vk-public-footer-link/);
  assert.equal(markup.match(/data-vk-public-footer-link=/g)?.length, items.length);
  assert.doesNotMatch(markup, /become-author|\/articles|javascript:/);
}

const homeFooter = renderToStaticMarkup(createElement(VkPublicFooter, { variant: "home" }));
assert.match(homeFooter, /data-vk-home-legal/);
assertVkFooterAnchors(homeFooter, [...discovery, ...legal]);
assertVkFooterAnchors(profileFooter, [...discovery, ...legal]);
assertVkFooterAnchors(productVkFooter, legal);
assert.deepEqual(
  getVkDiscoveryFooterLinks().map((item) => item.url),
  discovery.map((item) => item.url),
);
assert.deepEqual(
  getVkLegalFooterLinks().map((item) => item.url),
  legal.map((item) => item.url),
);
for (const item of [...getVkDiscoveryFooterLinks(), ...getVkLegalFooterLinks()]) {
  assert.equal(isVkPublicFooterUrl(item.url), true, item.url);
  assert.equal(isVkGuestExternalUrl(item.url), true, item.url);
}
assert.equal(isVkPublicFooterUrl(LANDING_URL), false);
assert.equal(isVkPublicFooterUrl(VK_GUEST_LOGIN_URL), false);
assert.equal(isVkPublicFooterUrl(BECOME_AUTHOR_URL), false);
assert.equal(isVkPublicFooterUrl("https://audiolad.ru/articles"), false);
assert.equal(isVkPublicFooterUrl("https://evil.example/offer"), false);
assert.equal(isVkPublicFooterUrl("http://audiolad.ru/offer"), false);
assert.equal(isVkPublicFooterUrl("mailto:1@audiolad.ru"), false);
assert.equal(isVkGuestExternalUrl(VK_GUEST_LOGIN_URL), true);

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

  const vkRejected = installWindow();
  let rejectOpen = () => {};
  const pendingOpen = new Promise((resolve, reject) => {
    rejectOpen = reject;
  });
  globalThis.window.vkBridge = {
    isEmbedded() {
      return true;
    },
    send(method, params) {
      assert.equal(method, VK_BRIDGE_OPEN_LINK_METHOD);
      assert.equal(params.url, LANDING_URL);
      return pendingOpen;
    },
  };
  const desktopAsyncClick = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  assert.equal(
    activateVkAuthorsLandingClick(desktopAsyncClick, LANDING_URL, {
      client: "desktop",
    }),
    "bridge",
  );
  assert.equal(desktopAsyncClick.prevented, true);
  assert.equal(vkRejected.opened.length, 0);
  rejectOpen(new Error("bridge rejected"));
  await pendingOpen.catch(() => undefined);
  await Promise.resolve();
  assert.equal(vkRejected.opened.at(-1)?.url, LANDING_URL);
  assert.equal(vkRejected.opened.at(-1)?.target, "_blank");
} finally {
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
}

assert.equal(detectVkAuthorsLandingClient(null), "mobile");
assert.equal(detectVkAuthorsLandingClient({ location: { search: "" } }), "mobile");
assert.equal(detectVkAuthorsLandingClient({ location: { search: "?vk_platform=mobile_iphone" } }), "mobile");
assert.equal(detectVkAuthorsLandingClient({ location: { search: "?vk_platform=mobile_android&vk_user_id=1" } }), "mobile");
assert.equal(detectVkAuthorsLandingClient({ location: { search: "?vk_platform=mobile_web" } }), "mobile");
assert.equal(detectVkAuthorsLandingClient({ AndroidBridge: {} }), "mobile");
assert.equal(
  detectVkAuthorsLandingClient({ webkit: { messageHandlers: { VKWebAppClose: {} } } }),
  "mobile",
);
assert.equal(
  detectVkAuthorsLandingClient({
    AndroidBridge: {},
    location: { search: "?vk_platform=desktop_web" },
  }),
  "mobile",
);
assert.equal(
  detectVkAuthorsLandingClient({ location: { search: "?vk_platform=desktop_web" } }),
  "desktop",
);

function clickEvent() {
  return {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

const becomeAuthorClick = clickEvent();
let desktopOpens = 0;
assert.equal(
  activateVkAuthorsLandingClick(becomeAuthorClick, BECOME_AUTHOR_URL, {
    client: "desktop",
    openDesktop() {
      desktopOpens += 1;
      return true;
    },
  }),
  "blocked",
);
assert.equal(becomeAuthorClick.prevented, true);
assert.equal(desktopOpens, 0);

const mobileClick = clickEvent();
assert.equal(
  activateVkAuthorsLandingClick(mobileClick, LANDING_URL, {
    client: "mobile",
    openDesktop() {
      throw new Error("mobile tap must not depend on the bridge callback");
    },
  }),
  "native",
);
assert.equal(mobileClick.prevented, false);

const mobileViewClick = clickEvent();
assert.equal(
  activateVkAuthorsLandingClick(mobileViewClick, LANDING_URL, {
    view: { location: { search: "?vk_platform=mobile_iphone" } },
    openDesktop() {
      throw new Error("mobile webview must keep the native anchor");
    },
  }),
  "native",
);
assert.equal(mobileViewClick.prevented, false);

const desktopRejected = clickEvent();
assert.equal(
  activateVkAuthorsLandingClick(desktopRejected, LANDING_URL, {
    client: "desktop",
    openDesktop() {
      return false;
    },
  }),
  "native",
);
assert.equal(desktopRejected.prevented, false);

const desktopAccepted = clickEvent();
let acceptedUrl = "";
assert.equal(
  activateVkAuthorsLandingClick(desktopAccepted, LANDING_URL, {
    client: "desktop",
    openDesktop(url) {
      acceptedUrl = url;
      return true;
    },
  }),
  "bridge",
);
assert.equal(desktopAccepted.prevented, true);
assert.equal(acceptedUrl, LANDING_URL);
assert.equal(acceptedUrl.includes("become-author"), false);

const OFFER_URL = "https://audiolad.ru/offer";
const ABOUT_URL = "https://audiolad.ru/about";

const mobileFooterClick = clickEvent();
assert.equal(
  activateVkPublicFooterClick(mobileFooterClick, OFFER_URL, {
    client: "mobile",
    openDesktop() {
      throw new Error("mobile tap must not depend on the bridge callback");
    },
  }),
  "native",
);
assert.equal(mobileFooterClick.prevented, false);

const mobileFooterViewClick = clickEvent();
assert.equal(
  activateVkPublicFooterClick(mobileFooterViewClick, ABOUT_URL, {
    view: { location: { search: "?vk_platform=mobile_iphone" }, AndroidBridge: {} },
    openDesktop() {
      throw new Error("mobile webview must keep the native footer anchor");
    },
  }),
  "native",
);
assert.equal(mobileFooterViewClick.prevented, false);

const desktopFooterRejected = clickEvent();
assert.equal(
  activateVkPublicFooterClick(desktopFooterRejected, OFFER_URL, {
    client: "desktop",
    openDesktop() {
      return false;
    },
  }),
  "native",
);
assert.equal(desktopFooterRejected.prevented, false);

const desktopFooterAccepted = clickEvent();
let footerAcceptedUrl = "";
assert.equal(
  activateVkPublicFooterClick(desktopFooterAccepted, OFFER_URL, {
    client: "desktop",
    openDesktop(url) {
      footerAcceptedUrl = url;
      return true;
    },
  }),
  "bridge",
);
assert.equal(desktopFooterAccepted.prevented, true);
assert.equal(footerAcceptedUrl, OFFER_URL);

for (const unsafeUrl of [
  "https://evil.example/offer",
  "http://audiolad.ru/offer",
  BECOME_AUTHOR_URL,
  "https://audiolad.ru/articles",
  "javascript:alert(1)",
  "mailto:1@audiolad.ru",
  VK_GUEST_LOGIN_URL,
  `${OFFER_URL}?next=/admin`,
  LANDING_URL,
]) {
  const unsafeClick = clickEvent();
  assert.equal(
    activateVkPublicFooterClick(unsafeClick, unsafeUrl, {
      client: "desktop",
      openDesktop() {
        throw new Error(`non-allowlisted footer URL must not reach the bridge: ${unsafeUrl}`);
      },
    }),
    "blocked",
    unsafeUrl,
  );
  assert.equal(unsafeClick.prevented, true, unsafeUrl);
}

const footerWindow = globalThis.window;
try {
  const opened = [];
  const sent = [];
  globalThis.window = {
    open(url, target, features) {
      opened.push({ url, target, features });
      return {};
    },
    vkBridge: {
      isEmbedded() {
        return true;
      },
      send(method, params) {
        sent.push({ method, params });
        return { ok: true };
      },
    },
  };
  const bridgeClick = clickEvent();
  assert.equal(
    activateVkPublicFooterClick(bridgeClick, OFFER_URL, { client: "desktop" }),
    "bridge",
  );
  assert.equal(bridgeClick.prevented, true);
  assert.deepEqual(sent, [{
    method: VK_BRIDGE_OPEN_LINK_METHOD,
    params: { url: OFFER_URL },
  }]);
  assert.equal(opened.length, 0);

  globalThis.window.vkBridge.send = () => {
    throw new Error("sync bridge failure");
  };
  globalThis.window.open = () => {
    throw new Error("popup blocked");
  };
  const syncFailure = clickEvent();
  assert.equal(
    activateVkPublicFooterClick(syncFailure, "https://audiolad.ru/privacy", { client: "desktop" }),
    "native",
  );
  assert.equal(syncFailure.prevented, false);

  delete globalThis.window.vkBridge;
  const unsupported = clickEvent();
  assert.equal(
    activateVkPublicFooterClick(unsupported, "https://audiolad.ru/help", { client: "desktop" }),
    "native",
  );
  assert.equal(unsupported.prevented, false);

  let mobileSends = 0;
  globalThis.window.vkBridge = {
    isEmbedded() {
      return true;
    },
    send() {
      mobileSends += 1;
      return { ok: true };
    },
  };
  const embeddedMobile = clickEvent();
  assert.equal(
    activateVkPublicFooterClick(embeddedMobile, ABOUT_URL, {
      client: "mobile",
      openDesktop() {
        throw new Error("mobile tap must not depend on the bridge callback");
      },
    }),
    "native",
  );
  assert.equal(embeddedMobile.prevented, false);
  assert.equal(mobileSends, 0);
} finally {
  if (footerWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = footerWindow;
  }
}

const slider = read("src/components/max/MaxGuestHomeSlider.tsx");
assert.ok(home.indexOf("<MaxGuestHomeSlider") < home.indexOf("{closing"));
assert.doesNotMatch(slider, /data-mini-app-become-author-banner|MiniAppBecomeAuthorBanner/);
const sliderTrack = slider.slice(slider.indexOf("<ul"), slider.indexOf("</ul>"));
assert.match(sliderTrack, /onPointerDown=\{onPointerDown\}/);
assert.match(sliderTrack, /onPointerMove=\{onPointerMove\}/);

console.log("mini-app-home-banner-footer-unit: ok");
