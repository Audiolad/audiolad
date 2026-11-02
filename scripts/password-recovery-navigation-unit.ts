/**
 * Password recovery navigation: next preservation and open-redirect guards.
 */
import assert from "node:assert/strict";

import {
  buildPasswordRecoveryRedirectUrl,
  buildPostPasswordResetSignInHref,
  buildRecoveryRouteWithNext,
  buildResetPasswordRouteWithNext,
} from "../src/lib/auth/recovery";
import { resolveValidatedNextPath } from "../src/lib/auth/routes";

const ORIGIN = "https://audiolad.ru";

process.env.NEXT_PUBLIC_APP_URL = ORIGIN;

function decodeNext(urlValue: string): string {
  const url = new URL(urlValue);
  return url.searchParams.get("next") ?? "";
}

function decodeUltimateNextFromResetRoute(resetRoute: string): string | null {
  const queryIndex = resetRoute.indexOf("?");

  if (queryIndex === -1) {
    return null;
  }

  const params = new URLSearchParams(resetRoute.slice(queryIndex + 1));
  return params.get("next");
}

function runTests() {
  const checkoutNext =
    "/my-practices?purchased=provodnik-vnutrenniy-nastavnik";

  // 1. Internal path is preserved through the first-party recovery landing.
  const recoveryUrl = buildPasswordRecoveryRedirectUrl(checkoutNext);
  assert.equal(recoveryUrl.startsWith(`${ORIGIN}/auth/recovery?`), true);
  assert.equal(decodeNext(recoveryUrl), checkoutNext);

  // 2. Query string fully preserved (no split into outer params)
  const resetRoute = buildResetPasswordRouteWithNext(checkoutNext);
  assert.equal(decodeUltimateNextFromResetRoute(resetRoute), checkoutNext);
  const parsed = new URL(`${ORIGIN}${resetRoute}`);
  assert.equal(
    parsed.searchParams.get("next"),
    checkoutNext,
  );

  // 3. External URL rejected
  assert.equal(
    resolveValidatedNextPath("https://evil.example/phish"),
    null,
  );
  assert.equal(
    buildResetPasswordRouteWithNext("https://evil.example/phish"),
    "/auth/reset-password",
  );

  // 4. Protocol-relative rejected
  assert.equal(resolveValidatedNextPath("//evil.example"), null);

  // 5. Empty next uses defaults
  assert.equal(buildResetPasswordRouteWithNext(null), "/auth/reset-password");
  assert.equal(
    buildPostPasswordResetSignInHref(null),
    "/auth/sign-in?reset=1",
  );
  const defaultRecovery = buildPasswordRecoveryRedirectUrl(null);
  assert.equal(
    defaultRecovery,
    `${ORIGIN}/auth/recovery`,
  );
  assert.equal(buildRecoveryRouteWithNext(null), "/auth/recovery");

  // 6. Malformed encoding rejected safely
  assert.equal(resolveValidatedNextPath("/ok%"), null);
  assert.equal(
    buildPostPasswordResetSignInHref("/ok%"),
    "/auth/sign-in?reset=1",
  );

  // 7. Full checkout chain URLs
  const signInAfterReset = buildPostPasswordResetSignInHref(checkoutNext);
  assert.equal(
    signInAfterReset,
    `/auth/sign-in?reset=1&next=${encodeURIComponent(checkoutNext)}`,
  );

  const signInParams = new URL(`${ORIGIN}${signInAfterReset}`).searchParams;
  assert.equal(signInParams.get("reset"), "1");
  assert.equal(signInParams.get("next"), checkoutNext);

  const accessNext =
    "/access/abcdefghijklmnopqrstuvwxyz0123456789ABCD";
  assert.equal(resolveValidatedNextPath(accessNext), accessNext);

  // Auth entry routes cannot be used as ultimate destination
  assert.equal(resolveValidatedNextPath("/auth/sign-in"), null);
  assert.equal(
    buildPostPasswordResetSignInHref("/auth/sign-in"),
    "/auth/sign-in?reset=1",
  );

  console.log("password-recovery-navigation-unit: ok");
}

runTests();
