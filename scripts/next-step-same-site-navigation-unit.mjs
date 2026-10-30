#!/usr/bin/env node
/**
 * Regression: «Следующий шаг» / promo CTA links pasted as absolute
 * https://audiolad.ru/... URLs must resolve to internal targets so the button
 * renders a client-side <Link> (no full reload) and the persistent bottom
 * player keeps playing. Safe without database access.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolvePromoPageCtaTarget } from "../src/lib/promo-pages/cta-target.ts";
import { resolvePublicPromoRecommendation } from "../src/lib/products/promo-recommendation.ts";
import { toMiniAppNextStep } from "../src/lib/mini-app/next-step.ts";

function read(path) {
  return readFileSync(path, "utf8");
}

// Production repro: «Как принять свою тень» → «Сила женственности».
const recommendation = resolvePublicPromoRecommendation({
  promo_enabled: true,
  promo_title: "Сила женственности",
  promo_text: "Медитация для раскрытия мягкости, красоты и внутренней женской силы",
  promo_button_text: "Открыть",
  promo_url: "https://audiolad.ru/practice/zoya-petrova/sila-zhenstvennosti",
  promo_open_in_new_tab: false,
});
assert.ok(recommendation, "recommendation resolves");
assert.deepEqual(recommendation.target, {
  kind: "internal",
  href: "/practice/zoya-petrova/sila-zhenstvennosti",
});
assert.equal(recommendation.openInNewTab, false);

// www host, query and hash are kept on the internal path.
assert.deepEqual(
  resolvePromoPageCtaTarget("https://www.audiolad.ru/catalog?type=music#top"),
  { kind: "internal", href: "/catalog?type=music#top" },
);
assert.deepEqual(resolvePromoPageCtaTarget("https://AudioLad.ru"), {
  kind: "internal",
  href: "/",
});

// Relative paths keep working as before.
assert.deepEqual(resolvePromoPageCtaTarget("/practice/a/b"), {
  kind: "internal",
  href: "/practice/a/b",
});

// Other apps/hosts stay external (full navigation is correct there).
for (const href of [
  "https://school.audiolad.ru",
  "https://max.audiolad.ru/promo",
  "https://example.com/practice/a/b",
  "https://audiolad.ru:8443/practice/a/b",
]) {
  assert.equal(resolvePromoPageCtaTarget(href)?.kind, "external", href);
}

// Absolute links to paths that are not allowed as internal CTA targets keep
// their previous external behaviour instead of becoming invalid.
assert.equal(
  resolvePromoPageCtaTarget("https://audiolad.ru/auth/sign-in")?.kind,
  "external",
);
assert.equal(resolvePromoPageCtaTarget("https://audiolad.ru/api/x")?.kind, "external");

// Mini-app next step still produces the same absolute production URL.
assert.equal(
  toMiniAppNextStep(recommendation)?.url,
  "https://audiolad.ru/practice/zoya-petrova/sila-zhenstvennosti",
);

// Internal targets render through next/link (client navigation, no reload).
const nextStep = read("src/components/products/NextStepRecommendation.tsx");
assert.match(nextStep, /import Link from "next\/link"/);
assert.match(nextStep, /target\.kind === "internal" \? \(\s*<Link/);
assert.doesNotMatch(nextStep, /window\.location/);
assert.doesNotMatch(nextStep, /\.pause\(|stopPlayback|clearQueue/);

const promoPresentation = read("src/components/promo-pages/PromoPagePresentation.tsx");
assert.match(promoPresentation, /cta\.kind === "internal"\) \{\s*return \(\s*<Link/);

console.log("next-step-same-site-navigation-unit: ok");
