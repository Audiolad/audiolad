import assert from "node:assert/strict";
import test from "node:test";

import { shouldSetPartnerAttributionCookie } from "../src/lib/author-partner/cookie";

test("sets cookie for created", () => {
  assert.equal(shouldSetPartnerAttributionCookie({ result: "created" }), true);
});

test("sets cookie for bound when attribution id exists", () => {
  assert.equal(
    shouldSetPartnerAttributionCookie({ result: "bound", attributionId: "x" }),
    true,
  );
});

test("does not set cookie for preserved_first_touch without sql flag", () => {
  assert.equal(
    shouldSetPartnerAttributionCookie({ result: "preserved_first_touch" }),
    false,
  );
});

test("does not set cookie for already_author / referral_already_activated", () => {
  assert.equal(shouldSetPartnerAttributionCookie({ result: "already_author" }), false);
  assert.equal(
    shouldSetPartnerAttributionCookie({ result: "referral_already_activated" }),
    false,
  );
});

test("honors explicit sql cookieShouldSet", () => {
  assert.equal(
    shouldSetPartnerAttributionCookie({
      result: "preserved_first_touch",
      cookieShouldSet: true,
    }),
    true,
  );
});
