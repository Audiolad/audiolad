#!/usr/bin/env node
/**
 * PWA install unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isAuthRoute(pathname) {
  return pathname.startsWith("/auth/");
}

function isCabinetRoute(pathname) {
  if (pathname === "/") {
    return true;
  }

  const prefixes = [
    "/profile",
    "/my-practices",
    "/playlists",
    "/history",
    "/settings",
  ];

  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isExcludedBannerRoute(pathname) {
  const prefixes = ["/auth/", "/listen/", "/checkout/", "/author-dashboard/"];
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function shouldShowPwaBanner(input) {
  const now = input.now ?? Date.now();

  if (!input.isAuthReady) {
    return false;
  }

  if (!input.isAuthenticated) {
    return false;
  }

  if (isAuthRoute(input.pathname) || isExcludedBannerRoute(input.pathname)) {
    return false;
  }

  if (!isCabinetRoute(input.pathname)) {
    return false;
  }

  if (input.isStandalone) {
    return false;
  }

  if (input.installState === "installed_confirmed") {
    return false;
  }

  if (!input.hasValueMoment) {
    return false;
  }

  if (input.dismissedUntil && input.dismissedUntil > now) {
    return false;
  }

  if (input.bannerShownThisSession) {
    return false;
  }

  if (input.promptAcceptedAt) {
    return false;
  }

  return (
    input.installCapability === "prompt_available" ||
    input.installCapability === "instructions_only"
  );
}

function testGuestDoesNotSeeBanner() {
  assert(
    shouldShowPwaBanner({
      isAuthenticated: false,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "prompt_available",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: null,
      promptAcceptedAt: null,
    }) === false,
    "guest must not see banner",
  );
}

function testRegisteredUserAfterValueMoment() {
  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "prompt_available",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: null,
      promptAcceptedAt: null,
    }) === true,
    "registered user with value moment should see banner",
  );
}

function testStandaloneHidesBanner() {
  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: true,
      hasValueMoment: true,
      installState: "installed_confirmed",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: null,
      promptAcceptedAt: null,
    }) === false,
    "standalone must hide banner",
  );
}

function testConfirmedInstallHidesBanner() {
  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "installed_confirmed",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: null,
      promptAcceptedAt: null,
    }) === false,
    "confirmed install must hide banner",
  );
}

function testDismissHidesForPeriod() {
  const future = Date.now() + 60_000;

  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "dismissed",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: future,
      promptAcceptedAt: null,
    }) === false,
    "dismiss should hide banner until expiry",
  );
}

function testDismissExpires() {
  const past = Date.now() - 60_000;

  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "eligible",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: past,
      promptAcceptedAt: null,
      now: Date.now(),
    }) === true,
    "banner should return after dismiss expiry",
  );
}

function testAndroidUsesPromptCapability() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );

  assert(provider.includes("beforeinstallprompt"), "captures beforeinstallprompt");
  assert(provider.includes("appinstalled"), "handles appinstalled");
  assert(provider.includes("runNativeInstallFromDialog"), "native prompt runs from dialog");
  assert(provider.includes("promptEvent.prompt()"), "calls native prompt explicitly");
}

function testAndroidInstructionsOnly() {
  const platform = readFileSync(
    "/var/www/audiolad/src/lib/pwa/platform.ts",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );
  const dialogCopy = readFileSync(
    "/var/www/audiolad/src/lib/pwa/dialog-copy.ts",
    "utf8",
  );

  assert(
    platform.includes('return "instructions_only"') &&
      platform.includes("isAndroidDevice"),
    "android without prompt uses instructions_only",
  );
  assert(dialog.includes('"android"'), "android dialog mode exists");
  assert(
    dialog.includes("Установить приложение"),
    "android instructions mention install",
  );
  assert(
    dialogCopy.includes("Установить АудиоЛад"),
    "android fallback title is unified",
  );
}

function testDesktopInstallFallback() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(provider.includes("openInstructionFallback"), "install fallback helper exists");
  assert(
    !provider.match(/runNativeInstallFromDialog[\s\S]{0,500}closeDialog\(\)/),
    "native prompt dismiss keeps instruction dialog open",
  );
  assert(dialog.includes("desktop_chrome"), "chrome desktop instructions");
  assert(dialog.includes("desktop_safari"), "safari desktop instructions");
  assert(
    readFileSync("/var/www/audiolad/src/lib/pwa/dialog-copy.ts", "utf8").includes(
      "закладках браузера",
    ),
    "bookmark note is secondary",
  );
}

function testMobileBannerPlatformHint() {
  const banner = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallBanner.tsx",
    "utf8",
  );
  const platform = readFileSync(
    "/var/www/audiolad/src/lib/pwa/platform.ts",
    "utf8",
  );

  assert(banner.includes("getMobileInstallBannerHint"), "banner uses platform hint");
  assert(platform.includes("На экран Домой"), "ios hint mentions Add to Home Screen");
  assert(
    platform.includes("Установить приложение"),
    "android hint mentions install",
  );
}

function testAppleMobileWebAppCapableMeta() {
  const layout = readFileSync("/var/www/audiolad/src/app/layout.tsx", "utf8");

  assert(
    layout.includes('"apple-mobile-web-app-capable": "yes"'),
    "layout declares apple-mobile-web-app-capable",
  );
}

function testIosInstructionsOnly() {
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );
  const dialogCopy = readFileSync(
    "/var/www/audiolad/src/lib/pwa/dialog-copy.ts",
    "utf8",
  );

  assert(dialog.includes("На экран"), "ios instructions mention Add to Home Screen");
  assert(dialog.includes("Поделиться"), "ios instructions mention Share");
  assert(dialog.includes("Добавить"), "ios instructions mention Add button");
  assert(
    dialogCopy.includes("Установить АудиоЛад"),
    "ios fallback title is unified",
  );
}

function testMenuItemAlwaysAvailable() {
  const profile = readFileSync(
    "/var/www/audiolad/src/components/profile/ProfileSections.tsx",
    "utf8",
  );
  const settings = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsSection.tsx",
    "utf8",
  );

  assert(profile.includes("PwaSettingsMenuItem"), "profile menu item exists");
  assert(settings.includes("PwaSettingsMenuItem"), "settings menu item exists");
}

function testSsrSafeProvider() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );
  const browserEnv = readFileSync(
    "/var/www/audiolad/src/lib/pwa/browser-environment.ts",
    "utf8",
  );

  assert(provider.startsWith('"use client"'), "provider is client-only");
  assert(provider.includes("usePwaBrowserEnvironment"), "provider uses browser env hook");
  assert(browserEnv.includes("useSyncExternalStore"), "browser env is hydration-safe");
  assert(browserEnv.includes("SERVER_SNAPSHOT"), "browser env has server snapshot");
}

function testListenerCleanup() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );

  assert(
    provider.includes("removeEventListener"),
    "event listeners are cleaned up",
  );
}

function testAnalyticsDedupe() {
  const analytics = readFileSync(
    "/var/www/audiolad/src/lib/pwa/analytics-client.ts",
    "utf8",
  );

  assert(analytics.includes("trackPwaEventOnce"), "deduped analytics helper exists");
  assert(analytics.includes("hasRecordedPwaAnalyticsEvent"), "dedupe guard exists");
}

function testPwaMigrationContract() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716200000_pwa_install_tracking.sql",
    "utf8",
  );

  assert(sql.includes("pwa_installed_at"), "profile install timestamp column");
  assert(sql.includes("pwa_install_platform"), "profile install platform column");
  assert(sql.includes("pwa_last_standalone_opened_at"), "standalone open column");
  assert(sql.includes("pwa\\_%"), "allows pwa analytics events");
}

function testServiceWorkerSafety() {
  const sw = readFileSync("/var/www/audiolad/public/sw.js", "utf8");

  assert(sw.includes("/api/"), "skips api caching");
  assert(sw.includes("range"), "skips range requests");
  assert(sw.includes("/listen/"), "skips listen routes");
  assert(sw.includes("navigate"), "bypasses navigation requests");
  assert(sw.includes("/_next/static/"), "documents next static bypass");
  assert(sw.includes("/_next/data/"), "bypasses next data requests");
  assert(sw.includes("text/x-component"), "bypasses rsc accept header");
  assert(sw.includes('headers.get("RSC")'), "bypasses rsc header");
  assert(sw.includes('headers.get("Next-Action")'), "bypasses server actions");
  assert(
    !sw.includes("isHashedStaticAsset"),
    "does not implement hashed static sw caching",
  );
  assert(
    !sw.includes("stale-while-revalidate"),
    "does not use stale-while-revalidate",
  );
  assert(
    sw.includes('key.startsWith("audiolad-pwa-")'),
    "deletes all app cache versions on activate",
  );
}

function testServiceWorkerStaleChunkPolicy() {
  const sw = readFileSync("/var/www/audiolad/public/sw.js", "utf8");

  assert(
    /if \(url\.pathname\.startsWith\("\/_next\/static\/"\)\) \{\s*return true;\s*\}/s.test(
      sw,
    ),
    "next static assets bypass service worker entirely",
  );
  assert(
    !sw.match(/isHashedStaticAsset[\s\S]{0,200}caches\.open/),
    "next static assets are not stored in cache storage",
  );
}

function testServiceWorkerCacheVersionBumped() {
  const sw = readFileSync("/var/www/audiolad/public/sw.js", "utf8");
  const constants = readFileSync(
    "/var/www/audiolad/src/lib/pwa/constants.ts",
    "utf8",
  );

  assert(sw.includes("audiolad-pwa-v3"), "service worker cache version bumped");
  assert(
    constants.includes("audiolad-pwa-v3"),
    "constants track service worker cache version",
  );
}

function testPwaBrowserEnvironmentHook() {
  const hook = readFileSync(
    "/var/www/audiolad/src/lib/pwa/browser-environment.ts",
    "utf8",
  );
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );

  assert(hook.includes("useSyncExternalStore"), "browser env uses external store");
  assert(hook.includes("SERVER_SNAPSHOT"), "stable server snapshot exists");
  assert(hook.includes("cachedClientSnapshot"), "client snapshot is cached");
  assert(
    hook.includes("browserEnvironmentEquals"),
    "browser env compares snapshot values",
  );
  assert(provider.includes("usePwaBrowserEnvironment"), "provider uses browser hook");
  assert(
    !provider.includes("navigator.userAgent"),
    "provider no longer reads navigator during render",
  );
}

function testBrowserEnvironmentSnapshotStability() {
  const source = readFileSync("src/lib/pwa/browser-environment.ts", "utf8");

  assert(
    source.includes("let cachedClientSnapshot"),
    "browser env keeps cached client snapshot",
  );
  assert(
    source.includes("browserEnvironmentEquals"),
    "browser env compares snapshots for stability",
  );
  assert(
    source.includes("cachedClientSnapshot = null"),
    "browser env invalidates cached snapshot on environment changes",
  );
}

function testMenuInstallUsesSharedFlow() {
  const menuItem = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsMenuItem.tsx",
    "utf8",
  );
  const profile = readFileSync(
    "/var/www/audiolad/src/components/profile/ProfileSections.tsx",
    "utf8",
  );
  const settings = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsSection.tsx",
    "utf8",
  );

  assert(menuItem.includes('openInstallFlow("menu")'), "menu item calls shared install flow");
  assert(menuItem.includes("type=\"button\""), "menu item uses semantic button");
  assert(menuItem.includes("aria-label"), "menu item has accessible label");
  assert(menuItem.includes("cursor-pointer"), "menu item shows pointer cursor");
  assert(profile.includes("PwaSettingsMenuItem"), "profile renders install menu item");
  assert(settings.includes("PwaSettingsMenuItem"), "settings renders install menu item");
}

function testPwaProviderErrorBoundary() {
  const boundary = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallErrorBoundary.tsx",
    "utf8",
  );
  const providers = readFileSync(
    "/var/www/audiolad/src/components/AppProviders.tsx",
    "utf8",
  );
  const fallback = readFileSync(
    "/var/www/audiolad/src/lib/pwa/fallback-context.ts",
    "utf8",
  );
  const settingsError = readFileSync(
    "/var/www/audiolad/src/app/settings/error.tsx",
    "utf8",
  );

  assert(boundary.includes("componentDidCatch"), "pwa boundary catches errors");
  assert(
    boundary.includes("PwaInstallContext.Provider"),
    "pwa boundary keeps install context on fallback",
  );
  assert(
    boundary.includes("PWA_INSTALL_FALLBACK_CONTEXT"),
    "pwa boundary uses safe fallback context",
  );
  assert(
    !boundary.match(/hasError[\s\S]{0,220}return this\.props\.appChildren;/),
    "pwa boundary no longer renders app without provider",
  );
  assert(providers.includes("PwaInstallProvider"), "normal provider still wired");
  assert(providers.includes("PwaInstallErrorBoundary"), "app providers wrap pwa layer");
  assert(
    fallback.includes('installState: "unsupported"'),
    "fallback marks install as unavailable",
  );
  assert(
    !fallback.includes("window") &&
      !fallback.includes("navigator") &&
      !fallback.includes("localStorage"),
    "fallback context avoids browser APIs",
  );
  assert(
    fallback.includes("canShowBanner: false"),
    "fallback hides banner",
  );
  assert(
    settingsError.includes("Не удалось загрузить настройки"),
    "settings route has localized error boundary",
  );
  assert(
    boundary.includes("PwaInstallDialog"),
    "pwa boundary keeps install dialog available on fallback",
  );
  assert(settingsError.includes("Обновить страницу"), "settings error has retry");
}

function testPwaFallbackContextContract() {
  const fallback = readFileSync(
    "/var/www/audiolad/src/lib/pwa/fallback-context.ts",
    "utf8",
  );
  const menuItem = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsMenuItem.tsx",
    "utf8",
  );

  const requiredFields = [
    "installState",
    "isStandalone",
    "isAuthenticated",
    "canShowBanner",
    "uiVariant",
    "dialogMode",
    "isBannerVisible",
    "isMenuDialogOpen",
    "hasNativeInstallPrompt",
    "remindLater",
    "openInstallFlow",
    "openMenuInstall",
    "runNativeInstallFromDialog",
    "closeDialog",
    "dismissBannerForSession",
  ];

  for (const field of requiredFields) {
    assert(fallback.includes(`${field}:`), `fallback defines ${field}`);
  }

  assert(menuItem.includes("usePwaInstall"), "settings menu item consumes pwa context");
  assert(menuItem.includes("openInstallFlow"), "menu item uses install flow from context");
  assert(
    !boundaryRendersProviderlessFallback(),
    "boundary fallback always supplies provider",
  );
}

function boundaryRendersProviderlessFallback() {
  const boundary = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallErrorBoundary.tsx",
    "utf8",
  );

  return /if \(this\.state\.hasError\)[\s\S]*return this\.props\.appChildren;/.test(
    boundary,
  );
}

function testClientErrorReporterWiring() {
  const providers = readFileSync(
    "/var/www/audiolad/src/components/AppProviders.tsx",
    "utf8",
  );
  const reporter = readFileSync(
    "/var/www/audiolad/src/lib/client-errors/reporter.ts",
    "utf8",
  );
  const route = readFileSync(
    "/var/www/audiolad/src/app/api/client-errors/route.ts",
    "utf8",
  );

  assert(providers.includes("ClientErrorReporter"), "client reporter is mounted");
  assert(reporter.includes('addEventListener("error"'), "window error listener");
  assert(
    reporter.includes('addEventListener("unhandledrejection"'),
    "unhandled rejection listener",
  );
  assert(route.includes("client_error_report"), "server logs structured client errors");
}

function testManifestContract() {
  const manifest = readFileSync(
    "/var/www/audiolad/public/manifest.webmanifest",
    "utf8",
  );
  const parsed = JSON.parse(manifest);

  assert(parsed.display === "standalone", "standalone display");
  assert(parsed.scope === "/", "scope is root");
  assert(parsed.id === "/", "manifest id is root");
  assert(parsed.icons.some((icon) => icon.sizes === "192x192"), "192 icon");
  assert(parsed.icons.some((icon) => icon.sizes === "512x512"), "512 icon");
  assert(
    parsed.icons.some((icon) => icon.purpose === "maskable"),
    "maskable icon entry",
  );
}

function testAcceptedDoesNotConfirmInstall() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );

  assert(provider.includes("recordPwaPromptAccepted"), "records prompt acceptance");
  assert(
    !provider.match(
      /choice\.outcome === "accepted"[\s\S]{0,300}confirmPwaInstalled/,
    ),
    "accepted must not immediately confirm install",
  );
  assert(provider.includes("onAppInstalled"), "waits for appinstalled event");
}

function testPromptAcceptedHidesBanner() {
  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: true,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "prompt_available",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: null,
      promptAcceptedAt: Date.now(),
    }) === false,
    "prompt accepted hides banner until confirmed install",
  );
}

function testAuthNotReadyHidesBanner() {
  assert(
    shouldShowPwaBanner({
      isAuthenticated: true,
      isAuthReady: false,
      pathname: "/profile",
      isStandalone: false,
      hasValueMoment: true,
      installState: "prompt_available",
      installCapability: "prompt_available",
      bannerShownThisSession: false,
      dismissedUntil: null,
      promptAcceptedAt: null,
    }) === false,
    "banner hidden until auth ready",
  );
}

function testInAppBrowserFallback() {
  const platform = readFileSync(
    "/var/www/audiolad/src/lib/pwa/platform.ts",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(platform.includes("isInAppBrowser"), "in-app browser detection exists");
  assert(platform.includes("Telegram"), "detects Telegram");
  assert(dialog.includes("in_app_browser"), "in-app browser dialog mode");
}

function testCorruptedStorageFallback() {
  const storage = readFileSync("/var/www/audiolad/src/lib/pwa/storage.ts", "utf8");

  assert(storage.includes("PWA_INSTALL_STATES.includes"), "validates install state");
  assert(storage.includes("PWA_DEFAULT_DEVICE_STATE"), "fallback default state");
}

function testServiceWorkerNoOfflineHtml() {
  const sw = readFileSync("/var/www/audiolad/public/sw.js", "utf8");

  assert(!sw.includes("offline.html"), "does not serve missing offline.html");
  assert(sw.includes("CACHEABLE_PUBLIC_PATHS"), "uses explicit public asset allowlist");
  assert(sw.includes("/profile"), "skips profile HTML");
}

function testClickDoesNotConfirmInstallAlone() {
  testAcceptedDoesNotConfirmInstall();
}

function testMenuItemVisibilityRules() {
  const menuItem = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsMenuItem.tsx",
    "utf8",
  );
  const settingsSection = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsSection.tsx",
    "utf8",
  );

  assert(menuItem.includes("if (isStandalone)"), "menu item hides only in standalone");
  assert(
    !menuItem.includes("installed_confirmed"),
    "menu item does not hide from persistent install status",
  );
  assert(
    !settingsSection.includes("installed_confirmed"),
    "settings section does not hide install row from persistent status",
  );
  assert(settingsSection.includes("!isStandalone"), "settings section hides in standalone");
}

function testOpenInstallFlowAlwaysOpensDialog() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );

  assert(
    provider.match(
      /const openInstallFlow[\s\S]{0,220}openInstructionFallback\(source\)/,
    ),
    "menu click always opens instruction dialog first",
  );
  assert(
    !provider.match(/const openInstallFlow[\s\S]{0,500}runNativeInstallFromDialog/),
    "menu click does not invoke native prompt directly",
  );
  assert(
    !provider.match(/const openInstallFlow[\s\S]{0,220}installed_confirmed/),
    "stale installed status does not block opening dialog",
  );
}

function testNativePromptAvailablePath() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(provider.includes("runNativeInstallFromDialog"), "native prompt helper exists");
  assert(provider.includes("promptEvent.prompt()"), "native prompt is invoked explicitly");
  assert(provider.includes("userChoice"), "native prompt handles user choice");
  assert(provider.includes("NATIVE_PROMPT_TIMEOUT_MS"), "native prompt has timeout guard");
  assert(
    dialog.includes("hasNativeInstallPrompt") && dialog.includes("Установить"),
    "dialog exposes native install button when prompt is available",
  );
  assert(
    !provider.match(/runNativeInstallFromDialog[\s\S]{0,700}closeDialog\(\)/),
    "native prompt dismiss/error/timeout keeps instruction dialog open",
  );
}

function testInstructionsFallbackWithoutPrompt() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );
  const dialogCopy = readFileSync(
    "/var/www/audiolad/src/lib/pwa/dialog-copy.ts",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(provider.includes("openInstructionFallback"), "provider opens instruction fallback");
  assert(
    dialogCopy.includes("Установить АудиоЛад") &&
      dialogCopy.includes("Добавьте АудиоЛад на главный экран"),
    "mobile fallback copy matches product wording",
  );
  assert(dialog.includes('dialogMode === "android"'), "android instruction steps render");
  assert(dialog.includes("⋮"), "android steps mention overflow menu icon");
  assert(dialog.includes("Понятно"), "manual fallback keeps dismiss button");
}

function testStandaloneHidesInstallMenuItem() {
  const menuItem = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsMenuItem.tsx",
    "utf8",
  );

  assert(menuItem.includes("isStandalone"), "standalone participates in hide logic");
  assert(
    !menuItem.includes("installState === \"installed_confirmed\""),
    "standalone is the only hide condition in menu item",
  );
}

function testClosingDialogDoesNotConfirmInstall() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(provider.includes("setInstallDialogMode(null)"), "close dialog clears dialog mode");
  assert(
    !provider.match(/runNativeInstallFromDialog[\s\S]{0,400}confirmPwaInstalled/),
    "native accepted outcome does not confirm install without appinstalled",
  );
  assert(dialog.includes("onClick={closeDialog}"), "dialog close button only closes UI");
}

function testInstallDialogAccessibility() {
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(dialog.includes('role="dialog"'), "dialog exposes dialog role");
  assert(dialog.includes("aria-modal"), "dialog is modal");
  assert(dialog.includes("aria-labelledby"), "dialog has labelled title");
  assert(dialog.includes('event.key === "Escape"'), "dialog closes on Escape");
  assert(dialog.includes("document.body.style.overflow = \"hidden\""), "dialog locks scroll");
  assert(dialog.includes("safe-area-inset-bottom"), "dialog respects safe area");
}

function testInstallDialogControllerWiring() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallProvider.tsx",
    "utf8",
  );
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );
  const fallback = readFileSync(
    "/var/www/audiolad/src/lib/pwa/fallback-context.ts",
    "utf8",
  );
  const controller = readFileSync(
    "/var/www/audiolad/src/lib/pwa/install-dialog-controller.ts",
    "utf8",
  );

  assert(
    controller.includes("export function setInstallDialogMode"),
    "dialog controller exposes setter",
  );
  assert(
    controller.includes("export function getInstallDialogMode"),
    "dialog controller exposes getter",
  );
  assert(
    controller.includes("export function subscribeInstallDialogMode"),
    "dialog controller exposes subscribe",
  );
  assert(
    provider.includes('@/lib/pwa/install-dialog-controller"'),
    "provider imports dialog controller module",
  );
  assert(
    dialog.includes('@/lib/pwa/install-dialog-controller"'),
    "dialog imports dialog controller module",
  );
  assert(
    fallback.includes('@/lib/pwa/install-dialog-controller"'),
    "fallback context imports dialog controller module",
  );
  assert(provider.includes("setInstallDialogMode"), "provider uses dialog controller");
  assert(provider.includes("useInstallDialogMode"), "provider subscribes to dialog controller");
}

function testInstallDialogControllerArchitecture() {
  const dialogCopy = readFileSync(
    "/var/www/audiolad/src/lib/pwa/dialog-copy.ts",
    "utf8",
  );
  const controller = readFileSync(
    "/var/www/audiolad/src/lib/pwa/install-dialog-controller.ts",
    "utf8",
  );

  assert(
    dialogCopy.includes("export function getPwaInstallDialogCopy"),
    "dialog copy keeps copy helper",
  );
  assert(
    dialogCopy.includes("export function shouldShowInstallBookmarkFootnote"),
    "dialog copy keeps bookmark footnote helper",
  );
  assert(
    !dialogCopy.includes("export function setInstallDialogMode"),
    "dialog copy no longer exports controller setter",
  );
  assert(
    !dialogCopy.includes("export function subscribeInstallDialogMode"),
    "dialog copy no longer exports controller subscribe",
  );
  assert(
    !dialogCopy.match(/\nlet dialogMode:/),
    "dialog copy no longer owns module-level dialog mode",
  );
  assert(
    !dialogCopy.match(/\nconst listeners = new Set/),
    "dialog copy no longer owns controller listeners",
  );
  assert(
    controller.match(/\nlet dialogMode: PwaInstallDialogMode \| null = null;/),
    "controller keeps initial dialog mode null",
  );
  assert(
    !controller.includes("window") &&
      !controller.includes("document") &&
      !controller.includes("react"),
    "controller stays free of browser and React APIs",
  );
}

function testInstallDialogControllerRuntime() {
  const script = `
    import {
      getInstallDialogMode,
      setInstallDialogMode,
      subscribeInstallDialogMode,
    } from "./src/lib/pwa/install-dialog-controller.ts";

    if (getInstallDialogMode() !== null) {
      throw new Error("initial dialog mode must be null");
    }

    let notifyCount = 0;
    const unsubscribe = subscribeInstallDialogMode(() => {
      notifyCount += 1;
    });

    setInstallDialogMode("android");
    if (getInstallDialogMode() !== "android") {
      throw new Error("set/get must expose android mode");
    }
    if (notifyCount !== 1) {
      throw new Error("subscriber must be notified after set");
    }

    setInstallDialogMode("android");
    if (notifyCount !== 2) {
      throw new Error("repeated set must keep notifying subscribers");
    }

    unsubscribe();
    setInstallDialogMode("ios");
    if (notifyCount !== 2) {
      throw new Error("unsubscribe must stop notifications");
    }
    if (getInstallDialogMode() !== "ios") {
      throw new Error("set/get must expose ios mode");
    }

    setInstallDialogMode(null);
    if (getInstallDialogMode() !== null) {
      throw new Error("set/get must clear dialog mode");
    }
  `;

  const result = spawnSync("npx", ["tsx", "--eval", script], {
    cwd: "/var/www/audiolad",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        "install dialog controller runtime contract failed",
    );
  }
}

function testProfileInstallSubtitle() {
  const menuItem = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaSettingsMenuItem.tsx",
    "utf8",
  );

  assert(menuItem.includes("Добавьте иконку на экран"), "profile uses short subtitle");
  assert(
    !menuItem.includes("truncate"),
    "profile install row no longer truncates subtitle",
  );
  assert(
    menuItem.includes("min-[390px]:inline"),
    "profile subtitle hides on narrow screens",
  );
}

const tests = [
  ["guest does not see banner", testGuestDoesNotSeeBanner],
  ["registered user after value moment", testRegisteredUserAfterValueMoment],
  ["standalone hides banner", testStandaloneHidesBanner],
  ["confirmed install hides banner", testConfirmedInstallHidesBanner],
  ["dismiss hides for period", testDismissHidesForPeriod],
  ["dismiss expires", testDismissExpires],
  ["android beforeinstallprompt", testAndroidUsesPromptCapability],
  ["android instructions only", testAndroidInstructionsOnly],
  ["ios instructions", testIosInstructionsOnly],
  ["desktop install fallback", testDesktopInstallFallback],
  ["mobile banner platform hint", testMobileBannerPlatformHint],
  ["apple mobile web app capable meta", testAppleMobileWebAppCapableMeta],
  ["menu item available", testMenuItemAlwaysAvailable],
  ["ssr safe provider", testSsrSafeProvider],
  ["listener cleanup", testListenerCleanup],
  ["analytics dedupe", testAnalyticsDedupe],
  ["pwa migration contract", testPwaMigrationContract],
  ["service worker safety", testServiceWorkerSafety],
  ["service worker stale chunk policy", testServiceWorkerStaleChunkPolicy],
  ["service worker cache version bumped", testServiceWorkerCacheVersionBumped],
  ["pwa browser environment hook", testPwaBrowserEnvironmentHook],
  ["browser environment snapshot stability", testBrowserEnvironmentSnapshotStability],
  ["menu install uses shared flow", testMenuInstallUsesSharedFlow],
  ["pwa provider error boundary", testPwaProviderErrorBoundary],
  ["pwa fallback context contract", testPwaFallbackContextContract],
  ["client error reporter wiring", testClientErrorReporterWiring],
  ["manifest contract", testManifestContract],
  ["accepted does not confirm install", testAcceptedDoesNotConfirmInstall],
  ["prompt accepted hides banner", testPromptAcceptedHidesBanner],
  ["auth not ready hides banner", testAuthNotReadyHidesBanner],
  ["in-app browser fallback", testInAppBrowserFallback],
  ["corrupted storage fallback", testCorruptedStorageFallback],
  ["service worker no offline html", testServiceWorkerNoOfflineHtml],
  ["click does not confirm install", testClickDoesNotConfirmInstallAlone],
  ["menu item visibility rules", testMenuItemVisibilityRules],
  ["open install flow always opens dialog", testOpenInstallFlowAlwaysOpensDialog],
  ["native prompt available path", testNativePromptAvailablePath],
  ["instructions fallback without prompt", testInstructionsFallbackWithoutPrompt],
  ["standalone hides install menu item", testStandaloneHidesInstallMenuItem],
  ["closing dialog does not confirm install", testClosingDialogDoesNotConfirmInstall],
  ["install dialog accessibility", testInstallDialogAccessibility],
  ["install dialog controller wiring", testInstallDialogControllerWiring],
  ["install dialog controller architecture", testInstallDialogControllerArchitecture],
  ["install dialog controller runtime", testInstallDialogControllerRuntime],
  ["profile install subtitle", testProfileInstallSubtitle],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} pwa install checks passed`);
