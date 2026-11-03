#!/usr/bin/env node
/**
 * Runtime unit checks for Yandex Metrika retention/PWA mirroring.
 */
import assert from "node:assert/strict";

import {
  sendYandexGoal,
  initYandexMetrika,
  isYandexMetrikaReady,
  resetYandexMetrikaForTests,
} from "../src/lib/analytics/yandex-metrika.ts";
import {
  buildPwaYandexMetrikaParams,
  sanitizeYandexMetrikaGoalParams,
} from "../src/lib/analytics/yandex-metrika-params.ts";
import {
  isAdminAnalyticsRoute,
  shouldEnableYandexMetrika,
  shouldShowYandexAnalyticsConsentBanner,
} from "../src/lib/analytics/yandex-metrika-environment.ts";
import { sanitizeMetrikaPageUrl } from "../src/lib/analytics/yandex-metrika-url.ts";
import {
  hasRecordedPwaAnalyticsEvent,
  markPwaAnalyticsEventRecorded,
  resetPwaAnalyticsDedupeForTests,
} from "../src/lib/pwa/analytics-client.ts";

const calls = [];

globalThis.window = {
  location: {
    hostname: "audiolad.ru",
    pathname: "/profile",
  },
  localStorage: {
    getItem: () => "granted",
    setItem: () => undefined,
  },
  ym: (...args) => {
    calls.push(args);
  },
};

globalThis.process.env.NODE_ENV = "production";
globalThis.process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = "12345678";

function resetState() {
  calls.length = 0;
  resetYandexMetrikaForTests();
  resetPwaAnalyticsDedupeForTests();
  globalThis.window.ym = (...args) => {
    calls.push(args);
  };
}

resetState();

assert.doesNotThrow(() => {
  delete globalThis.window.ym;
  sendYandexGoal("pwa_install_accepted");
}, "missing window.ym does not throw");

resetState();
globalThis.window.ym = () => {
  throw new Error("blocked");
};
assert.doesNotThrow(() => {
  sendYandexGoal("pwa_install_accepted");
}, "blocked metrika does not throw");

resetState();

sendYandexGoal("unknown_event_name");
assert.equal(calls.length, 0, "unknown goal is ignored");

sendYandexGoal("pwa_install_accepted", {
  platform: "android",
  source: "banner",
});
assert.equal(calls.length, 1, "allowed goal reaches ym");
assert.equal(calls[0][1], "reachGoal");
assert.equal(calls[0][2], "pwa_install_accepted");
assert.deepEqual(calls[0][3], {
  platform: "android",
  source: "banner",
});

resetState();

sendYandexGoal("first_save_retention_prompt_install_clicked");
assert.deepEqual(
  calls[0][3],
  { source: "retention" },
  "retention goal infers source",
);

resetState();

const stripped = sanitizeYandexMetrikaGoalParams({
  email: "user@example.com",
  user_id: "11111111-1111-4111-8111-111111111111",
  source: "banner",
  platform: "ios",
});
assert.equal(stripped.email, undefined);
assert.equal(stripped.user_id, undefined);
assert.equal(stripped.source, "banner");
assert.equal(stripped.platform, "ios");

assert.equal(
  sanitizeMetrikaPageUrl("/checkout/result", "token=secret&registered=1"),
  "/checkout/result?registered=1",
  "sensitive query params removed from page url",
);
assert.equal(
  sanitizeMetrikaPageUrl("/access/abcdefghijklmnopqrstuvwxyz0123456789ABCD"),
  "/access/[redacted]",
  "access-link token is stripped from metrika pathname",
);

globalThis.process.env.NODE_ENV = "development";
resetState();
sendYandexGoal("pwa_install_accepted");
assert.equal(calls.length, 0, "development does not send goals");

globalThis.process.env.NODE_ENV = "production";
resetState();
assert.equal(
  shouldEnableYandexMetrika({
    pathname: "/admin",
    hostname: "audiolad.ru",
  }),
  false,
  "admin route disabled",
);
assert.equal(isAdminAnalyticsRoute("/admin/users"), true);
assert.equal(
  shouldEnableYandexMetrika({
    pathname: "/access/abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    hostname: "audiolad.ru",
  }),
  false,
  "access-link landing does not send metrika",
);
assert.equal(
  shouldEnableYandexMetrika({
    pathname: "/",
    hostname: "audiolad.ru",
  }),
  true,
  "audiolad.ru production Yandex behavior unchanged",
);
assert.equal(
  shouldEnableYandexMetrika({
    pathname: "/",
    hostname: "max.audiolad.ru",
  }),
  false,
  "max.audiolad.ru disables Yandex Metrika",
);
assert.equal(
  shouldEnableYandexMetrika({
    pathname: "/",
    hostname: "localhost",
  }),
  false,
  "localhost Yandex remains disabled",
);
assert.equal(
  shouldShowYandexAnalyticsConsentBanner({ hostname: "max.audiolad.ru" }),
  false,
  "MAX suppresses consent banner",
);
assert.equal(
  shouldShowYandexAnalyticsConsentBanner({ hostname: "audiolad.ru" }),
  true,
  "ordinary audiolad.ru consent banner still eligible",
);
assert.equal(
  shouldShowYandexAnalyticsConsentBanner({ hostname: "localhost" }),
  true,
  "localhost consent banner eligibility unchanged",
);

const dedupeKey = "session:accepted:banner";
markPwaAnalyticsEventRecorded(dedupeKey);
assert.equal(hasRecordedPwaAnalyticsEvent(dedupeKey), true);

assert.deepEqual(
  buildPwaYandexMetrikaParams({
    platform: "desktop_chromium",
    source: "retention",
    isStandalone: true,
  }),
  {
    platform: "desktop",
    source: "retention",
    browser_environment: "standalone",
  },
);

resetState();
assert.equal(sendYandexGoal("business_cabinet_signed_in"), true);
assert.equal(sendYandexGoal("business_trial_access_confirmed"), true);
assert.equal(sendYandexGoal("business_paid_access_confirmed"), true);
assert.equal(sendYandexGoal("business_access_used_confirmed"), true);
assert.equal(sendYandexGoal("business_four_cups_clicked"), true);
assert.equal(calls.length, 5);
window.localStorage.getItem = () => "denied";
assert.equal(sendYandexGoal("business_paid_access_confirmed"), false);
assert.equal(calls.length, 5, "revoked consent blocks access goals");
window.localStorage.getItem = () => "granted";
window.location.hostname = "business.audiolad.ru";
window.location.pathname = "/cabinet";
window.dispatchEvent = () => true;
globalThis.document = { querySelectorAll: () => [], documentElement: {} };
globalThis.MutationObserver = class { observe() {} };
resetState();
initYandexMetrika(12345678, "/cabinet");
initYandexMetrika(12345678, "/music");
assert.equal(calls.length, 1, "same counter initialized only once across SPA routes");
assert.equal(calls[0][2].webvisor, false, "no Webvisor session recording in the Business cabinet");
assert.equal(calls[0][2].clickmap, true);
assert.equal(isYandexMetrikaReady(), true);
window.localStorage.getItem = () => "denied";
assert.equal(isYandexMetrikaReady(), false);
assert.equal(sendYandexGoal("business_cabinet_signed_in"), false);
window.localStorage.getItem = () => "granted";
for (const path of ["/documents/abc", "/point", "/player", "/coffee-handoff", "/business-app/documents/x"]) {
  window.location.pathname = path;
  assert.equal(sendYandexGoal("business_cabinet_signed_in"), false, `${path} has no Metrika on business hosts`);
}
window.location.pathname = "/music";
assert.equal(sendYandexGoal("business_cabinet_signed_in"), true);
console.log("yandex-metrika-retention-unit: ok");
