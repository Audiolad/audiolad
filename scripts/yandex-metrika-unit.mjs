#!/usr/bin/env node
/**
 * Yandex Metrika integration unit checks — no network or browser required.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testLibraryContract() {
  const library = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/lib/analytics/yandex-metrika.ts",
    "utf8",
  );
  const consent = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/lib/analytics/analytics-consent.ts",
    "utf8",
  );
  const goals = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/lib/analytics/yandex-metrika-goals.ts",
    "utf8",
  );

  assert(
    library.includes("NEXT_PUBLIC_YANDEX_METRIKA_ID"),
    "counter id from env var",
  );
  assert(!library.includes("110799004"), "counter id is not hardcoded");
  assert(library.includes("webvisor: true"), "webvisor enabled");
  assert(library.includes("clickmap: true"), "clickmap enabled");
  assert(library.includes("trackLinks: true"), "trackLinks enabled");
  assert(library.includes("accurateTrackBounce: true"), "accurateTrackBounce enabled");
  assert(library.includes("sendYandexGoal"), "typed goal helper");
  assert(library.includes("setupYandexMetrikaPrivacyMasking"), "privacy masking wired");
  assert(library.includes("initializedCounterId"), "double init guard");
  assert(library.includes("isAnalyticsConsentGranted"), "consent gate uses granted only");
  assert(goals.includes('"first_save_retention_prompt_shown"'), "retention goal allowlisted");
  assert(goals.includes('"pwa_install_accepted"'), "pwa goal allowlisted");
  assert(goals.includes('"pwa_opened_standalone"'), "standalone goal allowlisted");
  assert(
    !goals.includes('"first_manual_library_save"'),
    "server-only first save is not mirrored",
  );
  assert(consent.includes('"unknown"'), "unknown consent state");
  assert(consent.includes('writeAnalyticsConsent'), "explicit consent write");
}

function testComponentContract() {
  const component = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/components/analytics/YandexMetrika.tsx",
    "utf8",
  );
  const banner = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/components/analytics/AnalyticsConsentBanner.tsx",
    "utf8",
  );

  assert(component.includes('id="yandex-metrika-stub"'), "ym queue stub before tag.js");
  assert(component.includes("skipInitialHit"), "avoids duplicate initial hit");
  assert(component.includes("reachYandexMetrikaHit"), "spa hit wired");
  assert(component.includes("useAnalyticsConsentGranted"), "metrika gated by granted");
  assert(component.includes("shouldEnableYandexMetrika"), "admin/dev guard wired");
  assert(component.includes("searchParams"), "spa search params tracked safely");
  assert(banner.includes('writeAnalyticsConsent("granted")'), "banner grant action");
}

function testClientHooks() {
  const client = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/lib/analytics/client.ts",
    "utf8",
  );
  const pwaClient = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/lib/pwa/analytics-client.ts",
    "utf8",
  );

  assert(client.includes("sendYandexGoal"), "platform client mirrors metrika goals");
  assert(client.includes("isYandexMetrikaGoalName"), "goal allowlist used");
  assert(
    client.includes("isYandexMetrikaGoalName(input.event_name)"),
    "goals filtered in trackPlatformEvent",
  );
  assert(pwaClient.includes("sendYandexGoal"), "pwa client mirrors metrika goals");
  assert(pwaClient.includes("buildPwaYandexMetrikaParams"), "pwa params sanitized");
}

function testProvidersAndSettings() {
  const providers = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/components/AppProviders.tsx",
    "utf8",
  );
  const privacy = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/app/privacy/page.tsx",
    "utf8",
  );

  assert(providers.includes("YandexMetrika"), "metrika mounted in providers");
  assert(privacy.includes("Яндекс Метрика"), "privacy mentions metrika");
  assert(privacy.includes("Вебвизор"), "privacy mentions webvisor");
}

function testPrivacyContract() {
  const privacy = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-privacy-leaf/src/lib/analytics/yandex-metrika-privacy.ts",
    "utf8",
  );

  assert(
    privacy.includes("root.matches(INPUT_SELECTOR)"),
    "privacy masks root leaf input nodes",
  );
}

function testNoDuplicateEmitters() {
  const tracker = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/components/analytics/ListenAnalyticsTracker.tsx",
    "utf8",
  );
  const authorPanel = readFileSync(
    "/var/www/audiolad/.worktrees/yandex-metrika-retention-pwa/src/components/become-author/AuthorApplicationPanel.tsx",
    "utf8",
  );

  assert(!tracker.includes("sendYandexGoal"), "player tracker does not duplicate metrika");
  assert(!authorPanel.includes("sendYandexGoal"), "author panel does not duplicate metrika");
}

testLibraryContract();
testComponentContract();
testClientHooks();
testProvidersAndSettings();
testPrivacyContract();
testNoDuplicateEmitters();

console.log("yandex-metrika-unit: ok");
