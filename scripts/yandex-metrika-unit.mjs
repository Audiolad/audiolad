#!/usr/bin/env node
/**
 * Yandex Metrika integration unit checks — no network or browser required.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = [
  "src/lib/analytics/yandex-metrika.ts",
  "src/lib/analytics/analytics-consent.ts",
  "src/lib/analytics/yandex-metrika-goals.ts",
  "src/components/analytics/YandexMetrika.tsx",
  "src/components/analytics/AnalyticsConsentBanner.tsx",
  "src/lib/analytics/client.ts",
  "src/lib/pwa/analytics-client.ts",
  "src/components/providers/BaseProviders.tsx",
  "src/app/(platform)/privacy/page.tsx",
  "src/lib/analytics/yandex-metrika-privacy.ts",
  "src/components/analytics/ListenAnalyticsTracker.tsx",
  "src/components/become-author/AuthorApplicationPanel.tsx",
];

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testSourcesExistInCurrentTree() {
  for (const relativePath of SOURCES) {
    assert(
      existsSync(resolve(ROOT, relativePath)),
      `source exists in current tree: ${relativePath}`,
    );
  }
}

function testLibraryContract() {
  const library = readSource("src/lib/analytics/yandex-metrika.ts");
  const consent = readSource("src/lib/analytics/analytics-consent.ts");
  const goals = readSource("src/lib/analytics/yandex-metrika-goals.ts");

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
  assert(consent.includes("writeAnalyticsConsent"), "explicit consent write");
}

function testComponentContract() {
  const component = readSource("src/components/analytics/YandexMetrika.tsx");
  const banner = readSource(
    "src/components/analytics/AnalyticsConsentBanner.tsx",
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
  const client = readSource("src/lib/analytics/client.ts");
  const pwaClient = readSource("src/lib/pwa/analytics-client.ts");

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
  const providers = readSource("src/components/providers/BaseProviders.tsx");
  const privacy = readSource("src/app/(platform)/privacy/page.tsx");

  assert(providers.includes("YandexMetrika"), "metrika mounted in providers");
  assert(privacy.includes("Яндекс Метрика"), "privacy mentions metrika");
  assert(privacy.includes("Вебвизор"), "privacy mentions webvisor");
}

function testPrivacyContract() {
  const privacy = readSource("src/lib/analytics/yandex-metrika-privacy.ts");

  assert(
    privacy.includes("root.matches(INPUT_SELECTOR)"),
    "privacy masks root leaf input nodes",
  );
}

function testNoDuplicateEmitters() {
  const tracker = readSource(
    "src/components/analytics/ListenAnalyticsTracker.tsx",
  );
  const authorPanel = readSource(
    "src/components/become-author/AuthorApplicationPanel.tsx",
  );

  assert(!tracker.includes("sendYandexGoal"), "player tracker does not duplicate metrika");
  assert(!authorPanel.includes("sendYandexGoal"), "author panel does not duplicate metrika");
}

testSourcesExistInCurrentTree();
testLibraryContract();
testComponentContract();
testClientHooks();
testProvidersAndSettings();
testPrivacyContract();
testNoDuplicateEmitters();

console.log("yandex-metrika-unit: ok");
