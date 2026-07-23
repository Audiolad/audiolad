#!/usr/bin/env node
/**
 * Runtime unit checks for Yandex Metrika retention/PWA mirroring.
 */
import assert from "node:assert/strict";

import {
  sendYandexGoal,
  resetYandexMetrikaForTests,
} from "../src/lib/analytics/yandex-metrika.ts";
import {
  buildPwaYandexMetrikaParams,
  sanitizeYandexMetrikaGoalParams,
} from "../src/lib/analytics/yandex-metrika-params.ts";
import {
  isAdminAnalyticsRoute,
  shouldEnableYandexMetrika,
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

console.log("yandex-metrika-retention-unit: ok");
