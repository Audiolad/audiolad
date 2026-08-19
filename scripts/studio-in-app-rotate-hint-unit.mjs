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
  shouldShowStudioInAppRotateHint,
  STUDIO_IN_APP_ROTATE_HINT_DISMISSED_KEY,
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
  return shouldShowStudioInAppRotateHint({
    isInApp: isInAppBrowser(userAgent),
    isStandalone: false,
    isPortrait: true,
    isMobileViewport: !isDesktopEnvironment(userAgent),
    dismissed: false,
    ...overrides,
  });
}

assert.equal(shouldShowStudioInAppRotateHint(), false, "default call is hidden");
assert.equal(shouldShowStudioInAppRotateHint({}), false, "empty input is hidden");
assert.equal(isInAppBrowser(""), false, "empty UA is not in-app");
assert.equal(shownFor(""), false, "empty UA does not show");

for (const [name, ua] of Object.entries({
  telegramIos: UA.telegramIos,
  maxAndroid: UA.maxAndroid,
  vkAndroidApp: UA.vkAndroidApp,
  vkIos: UA.vkIos,
  fbanIos: UA.fbanIos,
})) {
  assert.equal(isInAppBrowser(ua), true, `${name} is in-app`);
  assert.equal(isDesktopEnvironment(ua), false, `${name} is not desktop`);
  assert.equal(shownFor(ua), true, `${name} + mobile + portrait shows hint`);
}

assert.equal(isInAppBrowser(UA.safariIphone), false, "Safari iPhone is not in-app");
assert.equal(shownFor(UA.safariIphone), false, "Safari iPhone stays hidden in portrait");
assert.equal(isInAppBrowser(UA.chromeAndroid), false, "Chrome Android is not in-app");
assert.equal(shownFor(UA.chromeAndroid), false, "Chrome Android stays hidden in portrait");

assert.equal(isDesktopEnvironment(UA.desktopChrome), true, "desktop UA is desktop");
assert.equal(isInAppBrowser(UA.desktopChrome), false, "desktop UA is not in-app");
assert.equal(shownFor(UA.desktopChrome), false, "desktop UA never shows");
assert.equal(
  shownFor(UA.desktopChrome, { isMobileViewport: true, isPortrait: true }),
  false,
  "desktop UA stays hidden even if viewport were mobile",
);

assert.equal(isInAppBrowser(UA.yandexAndroid), false, "Yandex Browser is not in-app");
assert.equal(isInAppBrowser(UA.samsungInternet), false, "Samsung Internet is not in-app");
assert.equal(isInAppBrowser(UA.androidWebView), false, "wv alone is not in-app");
assert.equal(isInAppBrowser(UA.genericVk), false, "generic VK is not in-app");

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
  shownFor(UA.telegramIos, { dismissed: true }),
  false,
  "dismissed session hides the hint",
);
assert.equal(
  shownFor(UA.telegramIos, { isMobileViewport: false }),
  false,
  "non-mobile viewport hides the hint",
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
assert.match(platform, /VKAndroidApp\|VKiOS/);
assert.match(editor, /shouldShowStudioInAppRotateHint/);
assert.match(editor, /isInAppBrowser/);
assert.match(editor, /isStandaloneMode/);
assert.match(editor, /isDesktopEnvironment/);
assert.match(editor, /copyTextToClipboard/);
assert.match(editor, /copyTextToClipboard\(window\.location\.href\)/);
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
assert.match(hintBlock, /Понятно/);
assert.match(hintBlock, /Скопировать ссылку/);
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

console.log("studio-in-app-rotate-hint-unit: ok");
