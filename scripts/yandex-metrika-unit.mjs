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
    "/var/www/audiolad/src/lib/analytics/yandex-metrika.ts",
    "utf8",
  );
  const consent = readFileSync(
    "/var/www/audiolad/src/lib/analytics/analytics-consent.ts",
    "utf8",
  );

  assert(
    library.includes("NEXT_PUBLIC_YANDEX_METRIKA_ID"),
    "counter id from env var",
  );
  assert(!library.includes("110799004"), "counter id is not hardcoded");
  assert(library.includes("webvisor: false"), "webvisor disabled");
  assert(library.includes("clickmap: false"), "clickmap disabled");
  assert(library.includes('"signup_completed"'), "signup goal");
  assert(library.includes('"audio_play_started"'), "play goal");
  assert(library.includes('"audio_completed"'), "completion goal");
  assert(library.includes('"author_application_submitted"'), "author goal");
  assert(library.includes("reachGoal"), "reachGoal wired");
  assert(library.includes("initializedCounterId"), "double init guard");
  assert(library.includes("isAnalyticsConsentGranted"), "consent gate uses granted only");
  assert(consent.includes('"unknown"'), "unknown consent state");
  assert(consent.includes('"granted"'), "granted consent state");
  assert(consent.includes('"denied"'), "denied consent state");
  assert(consent.includes('return "unknown"'), "default consent is unknown");
  assert(consent.includes('writeAnalyticsConsent'), "explicit consent write");
}

function testComponentContract() {
  const component = readFileSync(
    "/var/www/audiolad/src/components/analytics/YandexMetrika.tsx",
    "utf8",
  );
  const banner = readFileSync(
    "/var/www/audiolad/src/components/analytics/AnalyticsConsentBanner.tsx",
    "utf8",
  );
  const hook = readFileSync(
    "/var/www/audiolad/src/lib/analytics/use-analytics-consent.ts",
    "utf8",
  );

  assert(component.includes('id="yandex-metrika-stub"'), "ym queue stub before tag.js");
  assert(component.includes('from "next/script"'), "loads via next/script");
  assert(component.includes('strategy="afterInteractive"'), "after hydration");
  assert(component.includes("skipInitialHit"), "avoids duplicate initial hit");
  assert(component.includes("reachYandexMetrikaHit"), "spa hit wired");
  assert(component.includes("useAnalyticsConsentGranted"), "metrika gated by granted");
  assert(banner.includes('consent !== "unknown"'), "banner only for unknown");
  assert(banner.includes('writeAnalyticsConsent("granted")'), "banner grant action");
  assert(banner.includes('writeAnalyticsConsent("denied")'), "banner deny action");
  assert(hook.includes('() => "unknown"'), "server snapshot unknown");
  assert(hook.includes("() => false"), "server snapshot not granted");
}

function testClientHooks() {
  const client = readFileSync("/var/www/audiolad/src/lib/analytics/client.ts", "utf8");

  assert(client.includes("reachYandexMetrikaGoal"), "client reaches metrika goals");
  assert(client.includes("YANDEX_METRIKA_GOALS"), "goal allowlist used");
  assert(
    !client.includes("reachYandexMetrikaGoal(input.event_name)") ||
      client.includes("YANDEX_METRIKA_GOALS.has(input.event_name)"),
    "goals filtered in trackPlatformEvent",
  );
  assert(
    client.includes('reachYandexMetrikaGoal("signup_completed")'),
    "signup goal from recordPlatformSignupCompleted",
  );
}

function testProvidersAndSettings() {
  const providers = readFileSync(
    "/var/www/audiolad/src/components/AppProviders.tsx",
    "utf8",
  );
  const settings = readFileSync(
    "/var/www/audiolad/src/components/settings/AnalyticsPrivacySection.tsx",
    "utf8",
  );
  const privacy = readFileSync("/var/www/audiolad/src/app/privacy/page.tsx", "utf8");

  assert(providers.includes("YandexMetrika"), "metrika mounted in providers");
  assert(providers.includes("AnalyticsConsentBanner"), "consent banner mounted");
  assert(settings.includes("Конфиденциальность"), "privacy heading");
  assert(settings.includes('consent === "unknown"'), "settings explain unknown state");
  assert(privacy.includes("Яндекс Метрика"), "privacy mentions metrika");
  assert(privacy.includes("только после явного согласия"), "privacy mentions opt-in");
}

function testNoDuplicateEmitters() {
  const tracker = readFileSync(
    "/var/www/audiolad/src/components/analytics/ListenAnalyticsTracker.tsx",
    "utf8",
  );
  const authorPanel = readFileSync(
    "/var/www/audiolad/src/components/become-author/AuthorApplicationPanel.tsx",
    "utf8",
  );

  assert(!tracker.includes("reachYandexMetrikaGoal"), "player tracker does not duplicate metrika");
  assert(!authorPanel.includes("reachYandexMetrikaGoal"), "author panel does not duplicate metrika");
}

testLibraryContract();
testComponentContract();
testClientHooks();
testProvidersAndSettings();
testNoDuplicateEmitters();

console.log("yandex-metrika-unit: ok");
