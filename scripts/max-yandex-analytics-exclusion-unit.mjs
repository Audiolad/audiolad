#!/usr/bin/env node
/**
 * MAX host must not load Yandex Metrika or its cookie-consent banner.
 * Ordinary audiolad.ru / localhost / admin / recovery stay unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_HOSTNAME } from "../src/lib/max/host.ts";
import {
  shouldEnableYandexMetrika,
  shouldShowYandexAnalyticsConsentBanner,
} from "../src/lib/analytics/yandex-metrika-environment.ts";

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

try {
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/",
      hostname: MAX_HOSTNAME,
    }),
    false,
    "max.audiolad.ru disables Yandex Metrika",
  );
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/max-site",
      hostname: MAX_HOSTNAME,
    }),
    false,
    "MAX host disables Metrika even on internal /max-site rewrite",
  );
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/",
      hostname: "audiolad.ru",
    }),
    true,
    "audiolad.ru production keeps Yandex Metrika enabled",
  );
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/max-site",
      hostname: "audiolad.ru",
    }),
    true,
    "MAX exclusion is hostname-based, not pathname-based",
  );
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/",
      hostname: "localhost",
    }),
    false,
    "localhost remains disabled",
  );
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/admin",
      hostname: "audiolad.ru",
    }),
    false,
    "admin remains disabled",
  );
  assert.equal(
    shouldEnableYandexMetrika({
      pathname: "/access/abcdefghijklmnopqrstuvwxyz0123456789ABCD",
      hostname: "audiolad.ru",
    }),
    false,
    "recovery/access-link remains disabled",
  );

  assert.equal(
    shouldShowYandexAnalyticsConsentBanner({ hostname: MAX_HOSTNAME }),
    false,
    "MAX suppresses Yandex consent banner",
  );
  assert.equal(
    shouldShowYandexAnalyticsConsentBanner({ hostname: "audiolad.ru" }),
    true,
    "ordinary audiolad.ru still eligible for consent banner",
  );
  assert.equal(
    shouldShowYandexAnalyticsConsentBanner({ hostname: "localhost" }),
    true,
    "localhost banner eligibility unchanged",
  );
  assert.equal(
    shouldShowYandexAnalyticsConsentBanner({ hostname: "127.0.0.1" }),
    true,
    "loopback banner eligibility unchanged",
  );
} finally {
  process.env.NODE_ENV = previousNodeEnv;
}

const banner = readFileSync(
  join(process.cwd(), "src/components/analytics/AnalyticsConsentBanner.tsx"),
  "utf8",
);
const environment = readFileSync(
  join(process.cwd(), "src/lib/analytics/yandex-metrika-environment.ts"),
  "utf8",
);
const providers = readFileSync(
  join(process.cwd(), "src/components/providers/BaseProviders.tsx"),
  "utf8",
);

assert.match(environment, /isMaxHostname/);
assert.match(environment, /shouldShowYandexAnalyticsConsentBanner/);
assert.match(banner, /shouldShowYandexAnalyticsConsentBanner/);
assert.match(providers, /PlatformAnalyticsProvider/);
assert.doesNotMatch(
  providers,
  /shouldEnableYandexMetrika|shouldShowYandexAnalyticsConsentBanner/,
  "first-party PlatformAnalyticsProvider is not gated by MAX Yandex exclusion",
);

console.log("max-yandex-analytics-exclusion-unit: ok");
