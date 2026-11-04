import assert from "node:assert/strict";

import {
  buildAuthRouteHref,
  getSafeNextPath,
  resolveValidatedNextPath,
} from "../src/lib/auth/routes";
import {
  buildPasswordRecoveryRedirectUrl,
  buildPostPasswordResetSignInHref,
  buildRecoveryRouteWithNext,
  buildResetPasswordRouteWithNext,
} from "../src/lib/auth/recovery";
import { safeBusinessWorkspaceReturn } from "../src/lib/access-grants/paths";
import { safeBusinessNextPath } from "../src/lib/business-app/cabinet-mode";
import { coffeeReturnPath } from "../src/lib/business-app/guest-coffee/shared-identity";

function assertRejected(value: string) {
  const label = JSON.stringify(value);
  assert.equal(resolveValidatedNextPath(value), null, label);
  assert.equal(getSafeNextPath(value), "/profile", label);
  assert.equal(getSafeNextPath(value, "/cabinet"), "/cabinet", label);
  assert.equal(buildAuthRouteHref("/auth/sign-in", value), "/auth/sign-in", label);
  assert.equal(buildRecoveryRouteWithNext(value), "/auth/recovery", label);
  assert.equal(buildResetPasswordRouteWithNext(value), "/auth/reset-password", label);
  assert.equal(buildPostPasswordResetSignInHref(value), "/auth/sign-in?reset=1", label);
  assert.equal(coffeeReturnPath(value), "/", label);
  assert.equal(safeBusinessNextPath(value), "/", label);
  // The workspace return is rebuilt from a fixed path and a known space id, never echoed.
  const workspace = safeBusinessWorkspaceReturn(value);
  assert.ok(workspace === null || /^\/workspace(\?space=[a-z0-9-]+)?$/.test(workspace), label);
}

function testRejectUnsafeReturnPaths() {
  for (const value of [
    "", " ", "relative", "//x.org", "/\\x.org", "/%5Cx.org", "/%255cx.org",
    "/\t/x.org", "/\n/x.org", "/\r/x.org", "/%09/x.org", "/%2F%2Fx.org", "/%252f%252fx.org",
    "https://x.org", "javascript:alert(1)", "data:text/plain,a", "http://x.org",
    "/path?url=https://x.org", "/path?url=https%3A%2F%2Fx.org",
    "/%", "/%0", "/%GG", "/%C0%AF", "/%ED%A0%80", "/%25C0%250a/x.org", "/%2525%250a",
    "/auth/sign-in", "/auth/sign-up?x=1#a", "/auth/sign-in/nested",
    "/%61uth/sign-in", "/%2561uth/sign-up", "/a/../auth/sign-in",
    "/a/%2e%2e/auth/sign-up", "/a/..//x.org", "/a/%252e%252e//x.org",
  ]) {
    assertRejected(value);
  }

  const characters = [
    ...Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)),
    "\u007f", " ", "\u0085", "\u00a0", "\u1680", "\u2000", "\u2001",
    "\u2002", "\u2003", "\u2004", "\u2005", "\u2006", "\u2007", "\u2008",
    "\u2009", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff",
  ];
  for (const character of characters) {
    let encoded = character;
    for (let round = 0; round < 4; round++) {
      for (const value of [
        `${encoded}/practice/abc`, `/practice/abc${encoded}`,
        `/${encoded}/x.org`, `/practice/${encoded}abc`,
        `/workspace?space=cafe&x=${encoded}`, `/practice/abc#${encoded}`,
      ]) {
        assertRejected(value);
      }
      encoded = encodeURIComponent(encoded);
    }
  }
  for (const encoded of ["%09", "%0a", "%0d", "%250a", "%252525252525250a"]) {
    assertRejected(`/${encoded}/x.org`);
  }

  // Absolute return values remain unsupported, including first-party hosts.
  for (const host of [
    "audiolad.ru", "www.audiolad.ru", "coffee.audiolad.ru", "business.audiolad.ru",
    "localhost:3000", "127.0.0.1:3000",
  ]) {
    assertRejected(`https://${host}/practice/abc`);
  }
  assert.equal(getSafeNextPath(null, "//x.org"), "/profile");
  assert.equal(getSafeNextPath(null, "/%09/x.org"), "/profile");
  assert.equal(resolveValidatedNextPath(null), null);
  assert.equal(resolveValidatedNextPath(undefined), null);
}

function testPreserveValidReturnPaths() {
  for (const path of [
    "/", "/business-app?x=1#a", "/practice/abc", "/practice/a%2Fb?x=1&y=2#part",
    "/practice/%D0%BC%D0%B8%D1%80", "/practice/%25D0%25BC%25D0%25B8%25D1%2580",
    "/access/abcdefghijklmnopqrstuvwxyz0123456789ABCD", "/auth/business-return?site=coffee",
    "/auth/business-cabinet?site=coffee", "/workspace?space=cafe", "/cabinet#dostup",
    // Literal percent text in deeper layers stays a valid destination.
    "/catalog?q=100%25", "/catalog?q=100%25%25", "/%250", "/%25GG", "/catalog?q=%25D0",
  ]) {
    assert.equal(resolveValidatedNextPath(path), path);
    assert.equal(getSafeNextPath(path), path);
    assert.equal(coffeeReturnPath(path), path);
    assert.equal(safeBusinessNextPath(path), path);
    const signIn = new URL(buildAuthRouteHref("/auth/sign-in", path), "https://audiolad.invalid");
    assert.equal(signIn.searchParams.get("next"), path);
    const recovery = new URL(buildResetPasswordRouteWithNext(path), "https://audiolad.invalid");
    assert.equal(recovery.searchParams.get("next"), path);
  }
  assert.equal(resolveValidatedNextPath("/a/../practice/abc?x=1#a"), "/practice/abc?x=1#a");
  assert.equal(resolveValidatedNextPath("/practice/мир"), "/practice/%D0%BC%D0%B8%D1%80");
  assert.equal(getSafeNextPath(null, "/a/../cabinet"), "/cabinet");
  assert.equal(safeBusinessNextPath(`/${"a".repeat(512)}`), "/");
  assert.equal(safeBusinessWorkspaceReturn("/workspace?space=cafe&extra=1#part"), "/workspace?space=cafe");
  assert.equal(safeBusinessWorkspaceReturn("/workspace"), "/workspace");
  assert.equal(safeBusinessWorkspaceReturn("/practice/abc"), null);
}

function testRecoveryRedirectReturnPaths() {
  const original = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  try {
    process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
    const next = "/business-app?x=1#a";
    const recovery = new URL(buildPasswordRecoveryRedirectUrl(next, "coffee.audiolad.ru"));
    assert.equal(recovery.origin, "https://coffee.audiolad.ru");
    assert.equal(recovery.searchParams.get("next"), next);
    for (const value of ["/\t/x.org", "/%0a/x.org", "/%250d/x.org"]) {
      assert.equal(
        buildPasswordRecoveryRedirectUrl(value, "coffee.audiolad.ru"),
        "https://coffee.audiolad.ru/auth/recovery",
      );
    }
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
    else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = original;
  }
}

testRejectUnsafeReturnPaths();
testPreserveValidReturnPaths();
testRecoveryRedirectReturnPaths();
console.log("auth-return-path-unit: ok");
