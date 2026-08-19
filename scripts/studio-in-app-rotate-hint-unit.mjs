#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDesktopEnvironment,
  isInAppBrowser,
} from "../src/lib/pwa/platform.ts";
import {
  copyStudioShareUrl,
  isIosSafariUserAgent,
  isIosWebViewUserAgent,
  isNamedInAppUserAgent,
  isProbableIosEmbeddedBrowser,
  isStudioBrowserDebugQuery,
  resolveStudioInApp,
  shouldShowStudioInAppRotateHint,
  studioShareUrlFromHref,
  STUDIO_IN_APP_ROTATE_HINT_DISMISSED_KEY,
  truncateStudioBrowserDebugUserAgent,
} from "../src/lib/studio/in-app-rotate-hint.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const UA = {
  telegramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Telegram",
  maxAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 MAX",
  vkAndroidApp:
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 VKAndroidApp/8.50",
  vkIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VKiOS/8.50",
  fbanIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/10.0.0.0.0;]",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosWkWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  yandexAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 YaBrowser/24.1.0.0 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36",
  genericVk:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 VK",
};

function shownFor(userAgent, overrides = {}) {
  const hasSafariGlobal = overrides.hasSafariGlobal;
  const isStandalone = overrides.isStandalone === true;
  const hintOverrides = { ...overrides };
  delete hintOverrides.hasSafariGlobal;

  return shouldShowStudioInAppRotateHint({
    isInApp: resolveStudioInApp({
      userAgent,
      hasSafariGlobal,
      isStandalone,
    }),
    isStandalone,
    isPortrait: true,
    isMobileViewport: !isDesktopEnvironment(userAgent),
    dismissed: false,
    ...hintOverrides,
  });
}

assert.equal(shouldShowStudioInAppRotateHint(), false, "default call is hidden");
assert.equal(shouldShowStudioInAppRotateHint({}), false, "empty input is hidden");
assert.equal(isInAppBrowser(""), false, "empty UA is not in-app");
assert.equal(isNamedInAppUserAgent(""), false, "empty UA is not named in-app");
assert.equal(shownFor(""), false, "empty UA does not show");

for (const [name, ua] of Object.entries({
  telegramIos: UA.telegramIos,
  maxAndroid: UA.maxAndroid,
  vkAndroidApp: UA.vkAndroidApp,
  vkIos: UA.vkIos,
  fbanIos: UA.fbanIos,
})) {
  assert.equal(isInAppBrowser(ua), true, `${name} is in-app`);
  assert.equal(isNamedInAppUserAgent(ua), true, `${name} is named in-app`);
  assert.equal(isDesktopEnvironment(ua), false, `${name} is not desktop`);
  assert.equal(
    resolveStudioInApp({ userAgent: ua }),
    true,
    `${name} resolves as Studio in-app`,
  );
  assert.equal(shownFor(ua), true, `${name} + mobile + portrait shows hint`);
}

assert.equal(isInAppBrowser(UA.safariIphone), false, "Safari iPhone is not in-app");
assert.equal(isIosSafariUserAgent(UA.safariIphone), true, "Safari iPhone UA is Safari-shaped");
assert.equal(isIosWebViewUserAgent(UA.safariIphone), false, "Safari iPhone is not stock WKWebView");
assert.equal(
  resolveStudioInApp({ userAgent: UA.safariIphone, hasSafariGlobal: true }),
  false,
  "Safari iPhone + window.safari is not embedded",
);
assert.equal(
  isProbableIosEmbeddedBrowser({ userAgent: UA.safariIphone, hasSafariGlobal: true }),
  false,
  "Safari iPhone + window.safari is not probable embedded",
);
assert.equal(
  shownFor(UA.safariIphone, { hasSafariGlobal: true }),
  false,
  "Safari iPhone + hasSafariGlobal true stays hidden in portrait",
);

assert.equal(
  resolveStudioInApp({ userAgent: UA.safariIphone }),
  false,
  "Safari iPhone without hasSafariGlobal is not embedded (UA shape)",
);
assert.equal(
  isProbableIosEmbeddedBrowser({ userAgent: UA.safariIphone }),
  false,
  "Safari-shaped UA-only fallback is not embedded",
);
assert.equal(
  shownFor(UA.safariIphone),
  false,
  "Safari iPhone with omitted hasSafariGlobal stays hidden",
);

assert.equal(isInAppBrowser(UA.iosWkWebView), false, "stock WKWebView is not a named in-app UA");
assert.equal(isIosSafariUserAgent(UA.iosWkWebView), false, "stock WKWebView is not Safari UA");
assert.equal(isIosWebViewUserAgent(UA.iosWkWebView), true, "stock WKWebView UA matches");
assert.equal(
  resolveStudioInApp({ userAgent: UA.iosWkWebView, hasSafariGlobal: false }),
  true,
  "stock WKWebView + no window.safari is embedded",
);
assert.equal(
  resolveStudioInApp({ userAgent: UA.iosWkWebView }),
  true,
  "stock WKWebView with omitted hasSafariGlobal is embedded",
);
assert.equal(
  shownFor(UA.iosWkWebView, { hasSafariGlobal: false }),
  true,
  "stock WKWebView shows hint in portrait",
);
assert.equal(
  shownFor(UA.iosWkWebView),
  true,
  "stock WKWebView with omitted hasSafariGlobal shows hint in portrait",
);
assert.equal(
  shownFor(UA.iosWkWebView, { hasSafariGlobal: false, isPortrait: false }),
  false,
  "stock WKWebView stays hidden in landscape",
);

assert.equal(
  resolveStudioInApp({ userAgent: UA.safariIphone, hasSafariGlobal: false }),
  true,
  "Safari-shaped UA without window.safari is embedded (MAX iOS)",
);
assert.equal(
  isProbableIosEmbeddedBrowser({
    userAgent: UA.safariIphone,
    hasSafariGlobal: false,
  }),
  true,
  "MAX iOS spoofing Safari UA is probable embedded",
);
assert.equal(
  shownFor(UA.safariIphone, { hasSafariGlobal: false }),
  true,
  "MAX iOS Safari-shaped UA shows hint in portrait",
);

assert.equal(isInAppBrowser(UA.chromeIos), false, "Chrome iOS is not named in-app");
assert.equal(isIosSafariUserAgent(UA.chromeIos), false, "CriOS is not Safari");
assert.equal(isIosWebViewUserAgent(UA.chromeIos), false, "CriOS is not stock WKWebView");
assert.equal(
  resolveStudioInApp({ userAgent: UA.chromeIos, hasSafariGlobal: false }),
  false,
  "CriOS is not treated as embedded",
);
assert.equal(
  shownFor(UA.chromeIos, { hasSafariGlobal: false }),
  false,
  "CriOS stays hidden",
);

assert.equal(isInAppBrowser(UA.chromeAndroid), false, "Chrome Android is not in-app");
assert.equal(shownFor(UA.chromeAndroid), false, "Chrome Android stays hidden in portrait");
assert.equal(shownFor(UA.chromeAndroid, { hasSafariGlobal: false }), false);

assert.equal(isDesktopEnvironment(UA.desktopChrome), true, "desktop UA is desktop");
assert.equal(isInAppBrowser(UA.desktopChrome), false, "desktop UA is not in-app");
assert.equal(shownFor(UA.desktopChrome), false, "desktop UA never shows");
assert.equal(
  shownFor(UA.desktopChrome, { isMobileViewport: true, isPortrait: true }),
  false,
  "desktop UA stays hidden even if viewport were mobile",
);

assert.equal(isInAppBrowser(UA.yandexAndroid), false, "Yandex Browser is not in-app");
assert.equal(shownFor(UA.yandexAndroid), false, "Yandex stays hidden");
assert.equal(isInAppBrowser(UA.samsungInternet), false, "Samsung Internet is not in-app");
assert.equal(shownFor(UA.samsungInternet), false, "Samsung stays hidden");
assert.equal(isInAppBrowser(UA.androidWebView), false, "wv alone is not in-app");
assert.equal(shownFor(UA.androidWebView), false, "wv alone stays hidden");
assert.equal(isInAppBrowser(UA.genericVk), false, "generic VK is not in-app");
assert.equal(shownFor(UA.genericVk), false, "generic VK stays hidden");

assert.equal(
  shownFor(UA.telegramIos, { isPortrait: false }),
  false,
  "landscape hides the hint",
);
assert.equal(
  shownFor(UA.telegramIos, { isStandalone: true }),
  false,
  "standalone PWA hides the hint",
);
assert.equal(
  shownFor(UA.iosWkWebView, { hasSafariGlobal: false, isStandalone: true }),
  false,
  "standalone + WKWebView hides the hint",
);
assert.equal(
  resolveStudioInApp({
    userAgent: UA.iosWkWebView,
    hasSafariGlobal: false,
    isStandalone: true,
  }),
  false,
  "standalone + WKWebView is not Studio in-app",
);
assert.equal(
  shownFor(UA.telegramIos, { dismissed: true }),
  false,
  "dismissed session hides the hint",
);
assert.equal(
  shownFor(UA.telegramIos, { isMobileViewport: false }),
  false,
  "non-mobile viewport hides the hint",
);

assert.equal(isStudioBrowserDebugQuery("?studioBrowserDebug=1"), true);
assert.equal(isStudioBrowserDebugQuery("studioBrowserDebug=1"), true);
assert.equal(isStudioBrowserDebugQuery("?foo=1&studioBrowserDebug=1"), true);
assert.equal(isStudioBrowserDebugQuery("?studioBrowserDebug=0"), false);
assert.equal(isStudioBrowserDebugQuery(""), false);
assert.equal(
  truncateStudioBrowserDebugUserAgent("a".repeat(12), 8),
  `${"a".repeat(8)}…`,
);

assert.equal(
  STUDIO_IN_APP_ROTATE_HINT_DISMISSED_KEY,
  "audiolad.studio.inAppRotateHint.dismissed",
);

const editor = read("src/components/studio/StudioEditorShell.tsx");
const persisted = read("src/components/studio/PersistedStudioProjectShell.tsx");
const platform = read("src/lib/pwa/platform.ts");
const helper = read("src/lib/studio/in-app-rotate-hint.ts");

assert.match(helper, /export function shouldShowStudioInAppRotateHint/);
assert.match(helper, /export function resolveStudioInApp/);
assert.match(helper, /export function isProbableIosEmbeddedBrowser/);
assert.match(helper, /export function isIosWebViewUserAgent/);
assert.match(helper, /export function isIosSafariUserAgent/);
assert.match(helper, /export function isNamedInAppUserAgent/);
assert.match(platform, /VKAndroidApp\|VKiOS/);
assert.match(editor, /shouldShowStudioInAppRotateHint/);
assert.match(editor, /resolveStudioInApp/);
assert.match(editor, /hasSafariGlobal/);
assert.match(editor, /typeof \(window as SafariAwareWindow\)\.safari/);
assert.match(editor, /studioBrowserDebug/);
assert.match(editor, /data-studio-browser-debug/);
assert.match(editor, /isInAppBrowser/);
assert.match(editor, /isStandaloneMode/);
assert.match(editor, /isDesktopEnvironment/);
assert.match(editor, /copyStudioShareUrl/);
assert.match(editor, /copyTextWithVisibleExecCommand/);
assert.match(editor, /studioShareUrlFromHref|copyStudioShareUrl\(\{/);
assert.match(editor, /href: window\.location\.href/);
assert.doesNotMatch(editor, /copyTextToClipboard\(window\.location\.href\)/);
assert.match(editor, /sessionStorage/);
assert.match(editor, /matchMedia\("\(orientation: portrait\)"\)/);
assert.match(editor, /matchMedia\("\(max-width: 1023px\)"\)/);
assert.match(editor, /portraitQuery.matches/);

const hintStart = editor.indexOf("data-studio-in-app-rotate-hint");
assert.notEqual(hintStart, -1, "hint marker exists");
const hintBlock = editor.slice(hintStart, editor.indexOf("export default function StudioEditorShell"));
assert.match(
  hintBlock,
  /Для удобной работы в Студии откройте страницу во внешнем браузере и поверните телефон горизонтально\./,
);
assert.match(
  hintBlock,
  /Во встроенных браузерах некоторых приложений поворот экрана может быть недоступен\./,
);
assert.match(hintBlock, /Да, хорошо/);
assert.doesNotMatch(hintBlock, /Понятно/);
assert.match(hintBlock, /Скопировать ссылку/);
assert.match(hintBlock, /Ссылка скопирована/);
assert.match(
  hintBlock,
  /Не удалось скопировать автоматически\. Нажмите и удерживайте ссылку, чтобы скопировать её\./,
);
assert.match(hintBlock, /<input/);
assert.match(hintBlock, /readOnly/);
assert.doesNotMatch(hintBlock, /window\.open/);
assert.doesNotMatch(hintBlock, /openExternalUrl/);
assert.doesNotMatch(hintBlock, /copyTextToClipboard/);
assert.match(hintBlock, /pointer-events-none/);
assert.match(hintBlock, /pointer-events-auto/);
assert.match(hintBlock, /\babsolute\b/);
assert.match(hintBlock, /bg-\[#131b28\]/);
assert.doesNotMatch(hintBlock, /\bmb-4\b/);
assert.doesNotMatch(hintBlock, /\bfixed inset-0\b/);
assert.doesNotMatch(hintBlock, /Открыть во внешнем браузере/);
assert.doesNotMatch(
  hintBlock,
  /Telegram|\bMAX\b|Safari|Instagram|VKAndroidApp|VKiOS/,
);

const stickyStart = editor.indexOf("data-studio-sticky-chrome");
const mainStart = editor.indexOf("<main ");
assert.ok(stickyStart !== -1 && mainStart > stickyStart);
assert.doesNotMatch(
  editor.slice(stickyStart, mainStart),
  /data-studio-in-app-rotate-hint|Для удобной работы в Студии/,
);

const overlayIndex = editor.indexOf("<StudioInAppRotateHintBanner />");
const feedbackIndex = editor.indexOf("studio-editor-feedback");
assert.ok(overlayIndex > mainStart, "hint is not inside sticky chrome / before main");
assert.ok(feedbackIndex > overlayIndex, "hint sits in the same overlay band as editing notices");

assert.doesNotMatch(editor, /screen\.orientation/);
assert.doesNotMatch(editor, /orientation\.lock/);
assert.match(editor, /fixed inset-0 z-30 hidden flex-col/);

assert.match(persisted, /accessMode = "author"/);
assert.match(persisted, /<StudioEditorShell/);
assert.match(editor, /accessMode === "author"/);
assert.match(editor, /StudioGuestAuthLinks/);
assert.equal((editor.match(/export default function StudioEditorShell/g) || []).length, 1);
assert.doesNotMatch(
  editor,
  /GuestStudioEditor|AuthorStudioEditor|accessMode === "guest" \? \s*<header/,
);


assert.equal(
  studioShareUrlFromHref("https://audiolad.ru/studio?studioBrowserDebug=1"),
  "https://audiolad.ru/studio",
);
assert.equal(
  studioShareUrlFromHref("https://audiolad.ru/studio?studioBrowserDebug=1&from=try"),
  "https://audiolad.ru/studio?from=try",
);
assert.equal(
  studioShareUrlFromHref("https://audiolad.ru/studio?from=try&studioBrowserDebug=1&foo=bar"),
  "https://audiolad.ru/studio?from=try&foo=bar",
);
assert.equal(
  studioShareUrlFromHref("https://audiolad.ru/studio?from=try"),
  "https://audiolad.ru/studio?from=try",
);
assert.equal(
  studioShareUrlFromHref("https://audiolad.ru/studio?from=try#clip"),
  "https://audiolad.ru/studio?from=try#clip",
);
assert.equal(studioShareUrlFromHref("not a url"), "not a url");
assert.equal(studioShareUrlFromHref(""), "");

{
  const copied = await copyStudioShareUrl({
    href: "https://audiolad.ru/studio?studioBrowserDebug=1&from=try",
    writeText: async (value) => {
      assert.equal(value, "https://audiolad.ru/studio?from=try");
    },
    execCopy: () => {
      throw new Error("execCopy should not run when writeText succeeds");
    },
  });
  assert.deepEqual(copied, {
    url: "https://audiolad.ru/studio?from=try",
    result: "copied",
  });
}

{
  const copied = await copyStudioShareUrl({
    href: "https://audiolad.ru/studio?from=try",
    writeText: async () => {
      throw new Error("denied");
    },
    execCopy: () => true,
  });
  assert.deepEqual(copied, {
    url: "https://audiolad.ru/studio?from=try",
    result: "copied",
  });
}

{
  const manual = await copyStudioShareUrl({
    href: "https://audiolad.ru/studio",
    writeText: async () => {
      throw new Error("denied");
    },
    execCopy: () => false,
  });
  assert.deepEqual(manual, {
    url: "https://audiolad.ru/studio",
    result: "manual",
  });
}

{
  const manual = await copyStudioShareUrl({
    href: "https://audiolad.ru/studio",
    writeText: async () => {
      throw new Error("denied");
    },
    execCopy: () => {
      throw new Error("exec failed");
    },
  });
  assert.equal(manual.result, "manual");
}

assert.match(helper, /export function studioShareUrlFromHref/);
assert.match(helper, /export async function copyStudioShareUrl/);
assert.match(helper, /export function copyTextWithVisibleExecCommand/);
assert.match(helper, /position = "fixed"/);
assert.match(helper, /top = "0"/);
assert.match(helper, /left = "0"/);
assert.match(helper, /opacity = "0"/);
assert.match(helper, /setSelectionRange/);
assert.doesNotMatch(helper, /left = "-9999px"/);
assert.doesNotMatch(helper, /setAttribute\("readonly"/);

console.log("studio-in-app-rotate-hint-unit: ok");
