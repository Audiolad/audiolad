import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPartnerAttributionCookie,
  buildPartnerAttributionCookieClearOptions,
  buildPartnerAttributionCookieOptions,
  clearPartnerAttributionCookie,
  shouldClearPartnerAttributionCookie,
  shouldSetPartnerAttributionCookie,
} from "../src/lib/author-partner/cookie";
import { AUTHOR_PARTNER_ATTRIBUTION_COOKIE } from "../src/lib/author-partner/constants";

test("sets cookie for anonymous created", () => {
  assert.equal(shouldSetPartnerAttributionCookie({ result: "created" }), true);
});

test("does NOT set cookie for authenticated bound (no ghost cookie)", () => {
  assert.equal(shouldSetPartnerAttributionCookie({ result: "bound" }), false);
  assert.equal(
    shouldSetPartnerAttributionCookie({
      result: "bound",
      cookieShouldSet: true,
      attributionId: "x",
    }),
    false,
  );
});

test("does not set cookie for preserved / already_bound / already_author", () => {
  assert.equal(
    shouldSetPartnerAttributionCookie({ result: "preserved_first_touch" }),
    false,
  );
  assert.equal(shouldSetPartnerAttributionCookie({ result: "already_bound" }), false);
  assert.equal(shouldSetPartnerAttributionCookie({ result: "already_author" }), false);
  assert.equal(
    shouldSetPartnerAttributionCookie({ result: "referral_already_activated" }),
    false,
  );
});

test("clear options expire cookie on path=/", () => {
  const clear = buildPartnerAttributionCookieClearOptions();
  assert.equal(clear.name, AUTHOR_PARTNER_ATTRIBUTION_COOKIE);
  assert.equal(clear.path, "/");
  assert.equal(clear.maxAge, 0);
  assert.equal(clear.value, "");
});

test("clearPartnerAttributionCookie writes maxAge 0", () => {
  const writes: unknown[] = [];
  clearPartnerAttributionCookie({
    set: (cookie) => {
      writes.push(cookie);
    },
  });
  assert.equal(writes.length, 1);
  const cookie = writes[0] as { maxAge: number; name: string };
  assert.equal(cookie.name, AUTHOR_PARTNER_ATTRIBUTION_COOKIE);
  assert.equal(cookie.maxAge, 0);
});

test("bound → clear", () => {
  assert.equal(shouldClearPartnerAttributionCookie({ ok: true, result: "bound" }), true);
});

test("already_bound → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: true, result: "already_bound" }),
    true,
  );
});

test("preserved_first_touch (canonical referral) → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({
      ok: true,
      result: "preserved_first_touch",
    }),
    true,
  );
});

test("referral_already_activated → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({
      ok: true,
      result: "referral_already_activated",
    }),
    true,
  );
});

test("already_author → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: true, result: "already_author" }),
    true,
  );
});

test("attribution_expired → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: false, error: "attribution_expired" }),
    true,
  );
});

test("attribution_not_found → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({
      ok: false,
      error: "attribution_not_found",
    }),
    true,
  );
});

test("attribution_bound_elsewhere → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({
      ok: false,
      error: "attribution_bound_elsewhere",
    }),
    true,
  );
});

test("self_referral → clear", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: false, error: "self_referral" }),
    true,
  );
});

test("claim_failed → KEEP for retry", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: false, error: "claim_failed" }),
    false,
  );
});

test("touch_failed → KEEP for retry", () => {
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: false, error: "touch_failed" }),
    false,
  );
});

test("anonymous created → KEEP/SET cookie", () => {
  assert.equal(shouldSetPartnerAttributionCookie({ result: "created" }), true);
  assert.equal(
    shouldClearPartnerAttributionCookie({ ok: true, result: "created" }),
    false,
  );
  const opts = buildPartnerAttributionCookieOptions("a".repeat(64));
  assert.equal(opts.maxAge > 0, true);
  assert.equal(opts.path, "/");
});

/**
 * Shared-browser regression (logical):
 * A binds SERGEY → cookie cleared → B on same browser touches MARINA cleanly.
 */
test("shared-browser: A SERGEY bind clears cookie so B can take MARINA", () => {
  const jar = new Map<string, { value: string; maxAge: number }>();
  const store = {
    set(cookie: { name: string; value: string; maxAge?: number }) {
      jar.set(cookie.name, {
        value: cookie.value,
        maxAge: cookie.maxAge ?? 0,
      });
    },
  };

  // Anonymous A touches SERGEY → cookie set
  assert.equal(shouldSetPartnerAttributionCookie({ result: "created" }), true);
  applyPartnerAttributionCookie(store, "token-sergey-" + "1".repeat(48));
  assert.equal(jar.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.maxAge! > 0, true);

  // A signs up / claim → bound → clear
  assert.equal(shouldClearPartnerAttributionCookie({ ok: true, result: "bound" }), true);
  clearPartnerAttributionCookie(store);
  assert.equal(jar.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.maxAge, 0);
  assert.equal(jar.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.value, "");

  // B (same browser) anonymous touch MARINA → new cookie, no ghost SERGEY
  assert.equal(shouldSetPartnerAttributionCookie({ result: "created" }), true);
  applyPartnerAttributionCookie(store, "token-marina-" + "2".repeat(48));
  const bCookie = jar.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)!;
  assert.equal(bCookie.maxAge > 0, true);
  assert.match(bCookie.value, /^token-marina-/);

  // B claim → bound → clear again
  assert.equal(shouldClearPartnerAttributionCookie({ ok: true, result: "bound" }), true);
  clearPartnerAttributionCookie(store);
  assert.equal(jar.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.maxAge, 0);
});
