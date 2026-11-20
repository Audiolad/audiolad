// t1651u: VPN notice is shown only to a non-RU visitor, once, and never on hall routes.
import assert from "node:assert/strict";

import {
  VPN_NOTICE_TEXT,
  isVpnNoticeHallPath,
  isVpnNoticeHost,
  parseVpnNoticeShownUntil,
  shouldShowVpnNotice,
} from "../src/lib/vpn-notice/decision";

const now = 1_700_000_000_000;
const base = {
  country: "DE",
  hostname: "coffee.audiolad.ru",
  pathname: "/cabinet",
  shownUntil: null as number | null,
  hallDevice: false,
  now,
};

assert.equal(VPN_NOTICE_TEXT, "Для удобной работы сервиса выключите VPN");
assert.equal(VPN_NOTICE_TEXT.includes("\u2014"), false, "no em dash");

assert.equal(shouldShowVpnNotice({ ...base, country: "RU" }), false, "country RU means no notice");
assert.equal(shouldShowVpnNotice({ ...base, country: "ru" }), false, "lowercase RU means no notice");
assert.equal(shouldShowVpnNotice({ ...base, country: "DE" }), true, "non-RU means notice");
assert.equal(shouldShowVpnNotice({ ...base, country: "US", hostname: "audiolad.ru", pathname: "/" }), true);
assert.equal(shouldShowVpnNotice({ ...base, country: "US", hostname: "www.audiolad.ru" }), true);
assert.equal(shouldShowVpnNotice({ ...base, country: "US", hostname: "business.audiolad.ru" }), true);
assert.equal(shouldShowVpnNotice({ ...base, country: null }), false, "unknown country means no notice");
assert.equal(shouldShowVpnNotice({ ...base, country: "" }), false);
assert.equal(shouldShowVpnNotice({ ...base, country: "RUS" }), false);

assert.equal(
  shouldShowVpnNotice({ ...base, shownUntil: now + 60_000 }),
  false,
  "the flag set means no notice",
);
assert.equal(shouldShowVpnNotice({ ...base, shownUntil: now - 1 }), true, "an expired flag means notice again");
assert.equal(parseVpnNoticeShownUntil(String(now + 1)), now + 1);
assert.equal(parseVpnNoticeShownUntil("nope"), null);

for (const pathname of [
  "/point",
  "/player",
  "/spa",
  "/spa/design-preview",
  "/owner",
  "/workspace",
  "/business-app/point",
  "/business-app/player",
  "/business-app/spa",
  "/business-app/owner",
  "/business-app/workspace",
]) {
  assert.equal(isVpnNoticeHallPath(pathname), true, pathname);
  assert.equal(shouldShowVpnNotice({ ...base, pathname }), false, `hall routes mean no notice: ${pathname}`);
}

assert.equal(shouldShowVpnNotice({ ...base, pathname: "/music" }), true, "cabinet music is not a hall route");
assert.equal(shouldShowVpnNotice({ ...base, pathname: "/guest/coffee" }), true);
assert.equal(shouldShowVpnNotice({ ...base, pathname: "/music", hallDevice: true }), false);
assert.equal(isVpnNoticeHost("coffee.audiolad.ru"), true);
assert.equal(isVpnNoticeHost("school.audiolad.ru"), false);
assert.equal(shouldShowVpnNotice({ ...base, hostname: "school.audiolad.ru" }), false);

console.log("vpn-notice-unit: ok");
