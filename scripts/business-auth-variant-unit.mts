import assert from "node:assert/strict";

import { authVariantLinkParams, selectAuthVariant } from "../src/components/auth/variant";
import { buildAuthRouteHref } from "../src/lib/auth/routes";
import { BUSINESS_HOSTNAME } from "../src/lib/business-app/host";

for (const input of [
  { next: "/auth/business-return" },
  { next: "%2Fauth%2Fbusiness-return%3Fx%3D1" },
  { next: "/auth/business-return?x=1" },
  { next: "/auth/business-cabinet" },
  { next: "/auth/business-cabinet?x=1" },
  { next: "%2Fauth%2Fbusiness-cabinet%3Fx%3D1" },
  { from: "business" },
  { from: "business", next: "/profile" },
  { hostname: BUSINESS_HOSTNAME },
  { hostname: "BUSINESS.AUDIOLAD.RU:443" },
]) {
  assert.equal(selectAuthVariant(input), "business", JSON.stringify(input));
}

for (const input of [
  {},
  { next: "/profile" },
  { from: "other" },
  { next: "https://evil/auth/business-return" },
  { next: "//evil/auth/business-return" },
  { next: "/auth/business-return/other" },
  { next: "/auth/business-cabinet-other" },
  { next: "%E0%A4%A" },
  { hostname: "business.audiolad.ru.evil" },
  { hostname: "audiolad.ru" },
]) {
  assert.equal(selectAuthVariant(input), "ordinary", JSON.stringify(input));
}

// Promo signup context converts its internal returnTo into next using this helper.
for (const [returnTo, expected] of [
  ["/auth/business-return", "business"],
  ["/auth/business-cabinet", "business"],
  ["/catalog", "ordinary"],
] as const) {
  const href = buildAuthRouteHref("/auth/sign-up", returnTo, {
    intent: "save_practice",
    practice: "example-practice",
  });
  const { searchParams } = new URL(href, "https://audiolad.ru");
  assert.equal(searchParams.get("next"), returnTo);
  assert.equal(searchParams.has("returnTo"), false);
  assert.equal(searchParams.has("from"), false);
  assert.equal(selectAuthVariant({ next: searchParams.get("next") }), expected, href);
}

// Actual funnel query parsing, not just direct function arguments.
const params = new URLSearchParams("next=%2Fauth%2Fbusiness-return%3Fx%3D1");
assert.equal(selectAuthVariant({ next: params.get("next") }), "business");

for (const next of [null, "/auth/business-return?x=1", "/auth/business-cabinet?x=1", "/profile"]) {
  for (const route of ["/auth/sign-in", "/auth/sign-up", "/auth/forgot-password"] as const) {
    const href = buildAuthRouteHref(route, next, authVariantLinkParams("business"));
    const result = new URL(href, "https://audiolad.ru");
    assert.equal(result.searchParams.get("next"), next);
    assert.equal(result.searchParams.get("from"), "business");
    assert.equal(selectAuthVariant({ from: result.searchParams.get("from"), next }), "business");
    assert.equal(
      buildAuthRouteHref(route, next, authVariantLinkParams("ordinary")),
      buildAuthRouteHref(route, next),
      "ordinary navigation remains identical",
    );
  }
}
assert.equal(
  new URL(buildAuthRouteHref("/auth/sign-in", "https://evil/auth/business-return", authVariantLinkParams("business")), "https://audiolad.ru").searchParams.has("next"),
  false,
);
console.log("business-auth-variant-unit: ok");
