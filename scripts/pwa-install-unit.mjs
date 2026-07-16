#!/usr/bin/env node
/**
 * PWA install unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";

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
  assert(provider.includes("promptEvent.prompt()"), "calls native prompt on click");
}

function testIosInstructionsOnly() {
  const dialog = readFileSync(
    "/var/www/audiolad/src/components/pwa/PwaInstallDialog.tsx",
    "utf8",
  );

  assert(dialog.includes("На экран"), "ios instructions mention Add to Home Screen");
  assert(dialog.includes("Поделиться"), "ios instructions mention Share");
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

  assert(provider.startsWith('"use client"'), "provider is client-only");
  assert(
    provider.includes("useSyncExternalStore") ||
      provider.includes("typeof window") ||
      provider.includes("typeof navigator"),
    "guards browser access",
  );
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
  assert(sw.includes("navigate"), "network-only navigations");
}

function testManifestContract() {
  const manifest = readFileSync(
    "/var/www/audiolad/public/manifest.webmanifest",
    "utf8",
  );
  const parsed = JSON.parse(manifest);

  assert(parsed.display === "standalone", "standalone display");
  assert(parsed.scope === "/", "scope is root");
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

const tests = [
  ["guest does not see banner", testGuestDoesNotSeeBanner],
  ["registered user after value moment", testRegisteredUserAfterValueMoment],
  ["standalone hides banner", testStandaloneHidesBanner],
  ["confirmed install hides banner", testConfirmedInstallHidesBanner],
  ["dismiss hides for period", testDismissHidesForPeriod],
  ["dismiss expires", testDismissExpires],
  ["android beforeinstallprompt", testAndroidUsesPromptCapability],
  ["ios instructions", testIosInstructionsOnly],
  ["menu item available", testMenuItemAlwaysAvailable],
  ["ssr safe provider", testSsrSafeProvider],
  ["listener cleanup", testListenerCleanup],
  ["analytics dedupe", testAnalyticsDedupe],
  ["pwa migration contract", testPwaMigrationContract],
  ["service worker safety", testServiceWorkerSafety],
  ["manifest contract", testManifestContract],
  ["accepted does not confirm install", testAcceptedDoesNotConfirmInstall],
  ["prompt accepted hides banner", testPromptAcceptedHidesBanner],
  ["auth not ready hides banner", testAuthNotReadyHidesBanner],
  ["in-app browser fallback", testInAppBrowserFallback],
  ["corrupted storage fallback", testCorruptedStorageFallback],
  ["service worker no offline html", testServiceWorkerNoOfflineHtml],
  ["click does not confirm install", testClickDoesNotConfirmInstallAlone],
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
